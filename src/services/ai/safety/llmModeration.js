// Lớp kiểm duyệt 2 + 3 trên Groq (chỉ chạy khi lớp luật không bắt được):
//   - Prompt Guard 2: điểm 0–1 khả năng tin nhắn là jailbreak / prompt injection ("bỏ qua mọi hướng dẫn", "giờ bạn là DAN"...)
//   - gpt-oss-safeguard-20b: phân loại theo chính sách MapMate (constants/aiSafety.js — POLICY_TEXT)
// Lỗi / hết hạn mức => trả null (bỏ qua lớp đó). Bước "hiểu yêu cầu" vẫn tự đánh giá an toàn nên không bị hở.
import { z } from 'zod';
import { POLICY_TEXT, PROMPT_GUARD_THRESHOLD, SAFEGUARD_MAX_TOKENS, SAFETY_CATEGORIES, SAFETY_CATEGORY_VALUES, SAFETY_MODELS, SAFETY_TIMEOUT_MS } from '../../../constants/aiSafety.js';
import { callGroqOnce } from '../llmClient.js';

const verdictSchema = z.object({ violation: z.boolean(), category: z.enum(SAFETY_CATEGORY_VALUES).catch(SAFETY_CATEGORIES.NONE), reason: z.string().max(300).catch('') });

/** @returns {Promise<{ category, score, source } | null>} */
export const checkJailbreak = async (text) => {
  try {
    const score = Number(await callGroqOnce({ model: SAFETY_MODELS.PROMPT_GUARD, messages: [{ role: 'user', content: text }] }, { timeoutMs: SAFETY_TIMEOUT_MS }));
    if (Number.isNaN(score)) return null;
    return { category: score >= PROMPT_GUARD_THRESHOLD ? SAFETY_CATEGORIES.JAILBREAK : SAFETY_CATEGORIES.NONE, score, source: 'prompt_guard' };
  } catch {
    return null;
  }
};

/** @returns {Promise<{ category, reason, source } | null>} */
export const checkPolicy = async (text) => {
  try {
    const content = await callGroqOnce(
      {
        model: SAFETY_MODELS.SAFEGUARD,
        messages: [{ role: 'system', content: POLICY_TEXT }, { role: 'user', content: text }],
        reasoning_effort: 'low',
        include_reasoning: false,
        max_completion_tokens: SAFEGUARD_MAX_TOKENS,
        response_format: { type: 'json_object' },
      },
      { timeoutMs: SAFETY_TIMEOUT_MS },
    );
    const verdict = verdictSchema.parse(JSON.parse(content));
    const category = verdict.violation && verdict.category !== SAFETY_CATEGORIES.NONE ? verdict.category : SAFETY_CATEGORIES.NONE;
    return { category, reason: verdict.reason, source: 'safeguard' };
  } catch {
    return null;
  }
};
