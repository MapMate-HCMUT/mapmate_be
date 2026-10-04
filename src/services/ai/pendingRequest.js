// "Yêu cầu đang chờ": lượt trước hệ thống hỏi lại (thiếu thông tin) hoặc từ chối vì phi thực tế
// => lượt này người dùng trả lời ngắn ("Quận 1", "Ngân sách 200k/người") và được GHÉP vào yêu cầu cũ.
// Chỉ hỏi lại tối đa 1 lượt: đã hỏi rồi mà vẫn thiếu thì tự giả định và làm tiếp.
import { AI_INTENTS, REQUEST_QUALITY } from '../../constants/ai.js';

export const PENDING_KINDS = { CLARIFY: 'clarify', UNREALISTIC: 'unrealistic' };

// Câu mới sang chủ đề khác => bỏ yêu cầu đang chờ
const NEW_TOPIC_INTENTS = new Set([AI_INTENTS.ASK_PLACE, AI_INTENTS.OUT_OF_SCOPE, AI_INTENTS.SMALLTALK]);

const mergeValue = (key, previous, next) => {
  if (Array.isArray(next)) return next.length ? next : previous ?? [];
  if (key === 'date_hint') return next !== 'unspecified' ? next : previous ?? next;
  if (typeof next === 'boolean') return next || Boolean(previous);
  return next ?? previous ?? null;
};

export const mergeCriteria = (previous, next) => Object.fromEntries(Object.entries(next).map(([key, value]) => [key, mergeValue(key, previous[key], value)]));

/**
 * @returns {{ interpretation, continued: boolean }} continued = đã ghép với yêu cầu đang chờ
 */
export const resolvePending = (pending, interpretation) => {
  if (!pending?.interpretation || NEW_TOPIC_INTENTS.has(interpretation.intent) || interpretation.request_quality === REQUEST_QUALITY.NOT_ALLOWED) {
    return { interpretation, continued: false };
  }
  const previous = pending.interpretation;
  const quality = interpretation.request_quality === REQUEST_QUALITY.UNREALISTIC ? REQUEST_QUALITY.UNREALISTIC : REQUEST_QUALITY.OK;
  return {
    continued: true,
    interpretation: {
      ...interpretation,
      intent: previous.intent,
      request_quality: quality,
      clarifying_questions: [],
      refusal_reason: quality === REQUEST_QUALITY.OK ? null : interpretation.refusal_reason,
      criteria: mergeCriteria(previous.criteria, interpretation.criteria),
      places_mentioned: [...previous.places_mentioned, ...interpretation.places_mentioned].slice(0, 6),
    },
  };
};
