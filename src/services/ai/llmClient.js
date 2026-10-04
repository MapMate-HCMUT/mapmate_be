// Gọi Groq (OpenAI-compatible Chat Completions) với structured outputs.
// - response_format = json_schema (strict) => model buộc trả đúng khuôn;
// - vẫn kiểm tra lại bằng Zod; sai khuôn => gửi lỗi cho model sửa 1 lần;
// - Groq bận (429 / 5xx / mất mạng / quá thời gian) => thử lại 1 lần rồi báo lỗi để pipeline chuyển sang chế độ dự phòng.
// Không ghi log nội dung prompt / câu trả lời (có thể chứa thông tin người dùng).
import { AI_LLM_MAX_RETRIES, AI_LLM_RETRY_DELAY_MS, AI_LLM_TIMEOUT_MS } from '../../constants/ai.js';
import { env } from '../../config/env.js';
import { toProviderSchema } from './aiSchemas.js';

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);
const MAX_ISSUES_SHOWN = 5;

export class LlmError extends Error {
  constructor(message, { status = null, retryable = false, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
  }
}

export const isLlmConfigured = () => Boolean(env.llm.apiKey);
export const resolveModelId = (tier) => env.llm.models[tier] ?? env.llm.models.smart;

const MS_PER_SECOND = 1000;
const MAX_RETRY_AFTER_MS = 8000; // chờ lâu hơn thì chuyển luôn sang bản dự phòng cho nhanh
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestCompletion = async (body) => {
  let response;
  try {
    response = await fetch(`${env.llm.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.llm.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_LLM_TIMEOUT_MS),
    });
  } catch (error) {
    throw new LlmError(`Không gọi được Groq: ${error.name === 'TimeoutError' ? 'quá thời gian' : error.message}`, { retryable: true });
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    // 429 (vượt giới hạn gói miễn phí: 30 lượt / 8.000 token mỗi phút) => Groq báo số giây cần chờ trong retry-after
    const retryAfterMs = Number(response.headers.get('retry-after')) * MS_PER_SECOND || null;
    const retryable = RETRYABLE_STATUS.has(response.status) && (retryAfterMs == null || retryAfterMs <= MAX_RETRY_AFTER_MS);
    throw new LlmError(`Groq trả về HTTP ${response.status}: ${detail}`, { status: response.status, retryable, retryAfterMs });
  }
  return response.json();
};

// Gọi có thử lại khi lỗi tạm thời.
const requestWithRetry = async (body) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await requestCompletion(body);
    } catch (error) {
      if (!(error instanceof LlmError) || !error.retryable || attempt >= AI_LLM_MAX_RETRIES) throw error;
      await sleep(error.retryAfterMs ?? AI_LLM_RETRY_DELAY_MS * (attempt + 1));
    }
  }
};

const parseContent = (completion) => {
  const choice = completion.choices?.[0];
  const message = choice?.message ?? {};
  if (message.refusal) return { error: `Model từ chối: ${message.refusal}` };
  if (choice?.finish_reason === 'length') return { error: 'Câu trả lời bị cắt giữa chừng (quá giới hạn độ dài)' };
  try {
    return { value: JSON.parse(message.content ?? '') };
  } catch {
    return { error: 'Câu trả lời không phải JSON hợp lệ', raw: message.content };
  }
};

const describeIssues = (issues) =>
  issues.slice(0, MAX_ISSUES_SHOWN).map((issue) => `${issue.path.join('.') || '(gốc)'}: ${issue.message}`).join('; ');

/**
 * Gọi 1 Agent và nhận về object đã kiểm tra theo `schema` (Zod).
 * @returns {{ data, model, usage, latencyMs, attempts }}
 */
export const callStructured = async ({ tier, system, messages, schema, schemaName, temperature, maxTokens, reasoningEffort }) => {
  if (!isLlmConfigured()) throw new LlmError('Chưa cấu hình GROQ_API_KEY');
  const model = resolveModelId(tier);
  const startedAt = Date.now();
  const conversation = [{ role: 'system', content: system }, ...messages];
  const responseFormat = { type: 'json_schema', json_schema: { name: schemaName, schema: toProviderSchema(schema), strict: true } };
  const usage = { prompt_tokens: 0, completion_tokens: 0 };
  let lastProblem = null;

  // Lần 1: gọi bình thường. Lần 2 (nếu output sai khuôn): gửi kèm lỗi để model tự sửa.
  for (let attempt = 1; attempt <= 1 + AI_LLM_MAX_RETRIES; attempt += 1) {
    const completion = await requestWithRetry({
      model,
      messages: conversation,
      temperature,
      max_completion_tokens: maxTokens,
      reasoning_effort: reasoningEffort, // gpt-oss: low / medium / high
      include_reasoning: false, // không cần phần "suy nghĩ" của model, chỉ lấy JSON
      response_format: responseFormat,
    });
    usage.prompt_tokens += completion.usage?.prompt_tokens ?? 0;
    usage.completion_tokens += completion.usage?.completion_tokens ?? 0;

    const parsed = parseContent(completion);
    const checked = parsed.error ? null : schema.safeParse(parsed.value);
    if (checked?.success) return { data: checked.data, model: completion.model ?? model, usage, latencyMs: Date.now() - startedAt, attempts: attempt };

    lastProblem = parsed.error ?? describeIssues(checked.error.issues);
    conversation.push(
      { role: 'assistant', content: completion.choices?.[0]?.message?.content ?? '' },
      { role: 'user', content: `Output chưa đúng schema (${lastProblem}). Hãy trả lại DUY NHẤT 1 JSON đúng schema.` },
    );
  }
  throw new LlmError(`Output của model không đúng schema: ${lastProblem}`);
};
