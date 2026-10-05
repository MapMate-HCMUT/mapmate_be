// Giọng nói -> chữ bằng Groq Whisper (whisper-large-v3-turbo): tự nhận tiếng Việt / tiếng Anh, không cần chọn trước.
// Âm thanh chỉ chuyển tiếp cho Groq rồi bỏ — không lưu lại ở server.
import { AI_ERROR_CODES, VOICE } from '../../constants/ai.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { normalizeSearchText } from '../../utils/text.js';
import { acquireGroqSlot, isLlmConfigured, LlmError } from './llmClient.js';

const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/aac': 'aac', 'audio/m4a': 'm4a', 'audio/x-m4a': 'm4a' };
// Whisper hay "bịa" chữ khi không có tiếng nói (câu kết video YouTube quen thuộc) => coi như chưa nghe rõ.
// Không gửi prompt gợi ý từ vựng: khi im lặng, Whisper sẽ lặp lại chính các từ trong prompt.
const KNOWN_HALLUCINATIONS = /(cam on cac ban da (theo doi|xem|lang nghe)|hay (dang ky|subscribe) kenh|nho (like|dang ky)|thank(s| you) for watching|subtitles? by|ghien mi go|hen gap lai cac ban|amara\.org)/;
const isHallucination = (text) => !/\p{L}/u.test(text) || KNOWN_HALLUCINATIONS.test(normalizeSearchText(text)); // không có chữ cái nào ("." ) = không có tiếng nói

const unavailable = (message) => new AppError(message, HTTP_STATUS.SERVICE_UNAVAILABLE, AI_ERROR_CODES.AI_UNAVAILABLE);

/** @returns {{ text, language }} */
export const transcribeAudio = async (buffer, mimeType) => {
  const type = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (!VOICE.MIME_TYPES.includes(type)) throw new AppError('Định dạng âm thanh không được hỗ trợ', HTTP_STATUS.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.VOICE_UNSUPPORTED);
  if (!buffer?.length) throw new AppError('Không nhận được âm thanh, bạn thử nói lại nhé', HTTP_STATUS.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.VOICE_EMPTY);
  if (!isLlmConfigured()) throw unavailable('Chưa cấu hình nhận dạng giọng nói (GROQ_API_KEY)');

  try {
    acquireGroqSlot(VOICE.MODEL);
  } catch (error) {
    if (error instanceof LlmError) throw unavailable('Nhận dạng giọng nói đang quá tải, bạn thử lại sau ít phút nhé');
    throw error;
  }

  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), `voice.${EXTENSIONS[type] ?? 'webm'}`);
  form.append('model', VOICE.MODEL);
  form.append('response_format', 'verbose_json'); // có kèm ngôn ngữ nhận ra
  form.append('temperature', '0');

  let response;
  try {
    response = await fetch(`${env.llm.baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.llm.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(VOICE.TIMEOUT_MS),
    });
  } catch {
    throw unavailable('Không kết nối được dịch vụ nhận dạng giọng nói');
  }
  if (!response.ok) throw unavailable(response.status === 429 ? 'Nhận dạng giọng nói đang quá tải, bạn thử lại sau ít phút nhé' : 'Không nhận dạng được giọng nói, bạn thử lại nhé');
  const result = await response.json();
  const text = (result.text ?? '').trim();
  if (!text || isHallucination(text)) throw new AppError('Mình chưa nghe rõ, bạn nói lại nhé', HTTP_STATUS.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.VOICE_EMPTY);
  return { text, language: result.language ?? null };
};
