// Schema output của các Agent — viết 1 lần bằng Zod, dùng cho 2 việc:
// (1) đổi sang JSON Schema gửi Groq (structured outputs, strict) => model buộc phải trả đúng khuôn;
// (2) kiểm tra lại output ở server (không tin tuyệt đối vào model).
// Mọi trường đều "bắt buộc nhưng có thể null" (thay vì optional) để model luôn điền đủ khuôn.
import { z } from 'zod';
import { AI_INTENT_VALUES, AI_MAX_CLARIFYING_QUESTIONS, AI_PLACE_ROLES, AI_VEHICLE_VALUES, MISSING_INFO, PLACE_QUESTION_TOPICS, REQUEST_QUALITY } from '../../constants/ai.js';
import { MEAL_VALUES, VISIT_ROLE_VALUES } from '../../constants/tripRules.js';
import { EXPLORE_CATEGORIES, PLACE_TAG_VALUES } from '../../constants/places.js';
import { PLACE_INFO_SOURCES } from '../../constants/externalSources.js';

const CATEGORY_VALUES = EXPLORE_CATEGORIES.map((category) => category.value);
export const PRICE_LEVELS = ['cheap', 'moderate', 'upscale'];
export const DATE_HINTS = ['now', 'today', 'tonight', 'tomorrow', 'weekend', 'unspecified'];
const TIME_PATTERN = '^([01][0-9]|2[0-3]):[0-5][0-9]$';

// ── Agent 1: hiểu yêu cầu ──
export const interpretationSchema = z.object({
  intent: z.enum(AI_INTENT_VALUES),
  confidence: z.number().min(0).max(1),
  // Chất lượng yêu cầu: đủ để làm / thiếu thông tin / phi thực tế / không được phép
  request_quality: z.enum(Object.values(REQUEST_QUALITY)),
  missing: z.array(z.enum(MISSING_INFO)).max(MISSING_INFO.length),
  // Hỏi lại (tối đa 2 câu), mỗi câu kèm vài đáp án ngắn để người dùng bấm
  clarifying_questions: z.array(z.object({ question: z.string().max(160), options: z.array(z.string().max(40)).max(4) })).max(AI_MAX_CLARIFYING_QUESTIONS),
  refusal_reason: z.string().max(200).nullable(), // vì sao không làm được (phi thực tế / không được phép)
  criteria: z.object({
    categories: z.array(z.enum(CATEGORY_VALUES)).max(6),
    tags: z.array(z.enum(PLACE_TAG_VALUES)).max(6),
    people: z.number().int().min(1).max(20).nullable(),
    budget_per_person: z.number().int().min(0).max(50000000).nullable(), // đ / người / cả chuyến
    budget_total: z.number().int().min(0).max(200000000).nullable(), // đ cho cả nhóm (khi người dùng nói tổng)
    price_level: z.enum(PRICE_LEVELS).nullable(),
    start_time: z.string().regex(new RegExp(TIME_PATTERN)).nullable(), // "HH:mm" 24h
    date_hint: z.enum(DATE_HINTS),
    duration_hours: z.number().int().min(1).max(12).nullable(),
    vehicle: z.enum(AI_VEHICLE_VALUES).nullable(),
    district: z.string().max(40).nullable(),
    radius_km: z.number().min(1).max(20).nullable(),
    min_rating: z.number().min(0).max(5).nullable(),
    open_only: z.boolean().nullable(),
    keywords: z.array(z.string().max(40)).max(5), // món / chủ đề cụ thể: "lẩu", "ốc", "rooftop"
    // Khuôn lộ trình (services/tripComposer.js)
    sequence: z.array(z.enum(VISIT_ROLE_VALUES)).max(8), // thứ tự người dùng nói rõ: "ăn trưa rồi cà phê" => ["meal","drink"]
    meals: z.array(z.enum(MEAL_VALUES)).max(MEAL_VALUES.length), // bữa muốn ăn: "ăn tối" => ["dinner"]
    food_tour: z.boolean(), // đi ăn vặt nhiều món / food tour
    stop_count: z.number().int().min(1).max(8).nullable(), // "2–3 chỗ" => 3
  }),
  // Câu hỏi về 1 địa điểm cụ thể (intent = ask_place)
  place_question: z.object({ place_name: z.string().max(80).nullable(), topics: z.array(z.enum(PLACE_QUESTION_TOPICS)).max(PLACE_QUESTION_TOPICS.length) }),
  places_mentioned: z
    .array(z.object({ name: z.string().max(80), role: z.enum(Object.values(AI_PLACE_ROLES)) }))
    .max(6),
});

// ── Agent 3: tư vấn ──
// option_key / place_id chỉ được chọn trong danh sách có thật của lần này => model không thể "bịa" lộ trình / quán.
export const buildAdviceSchema = ({ optionKeys = [], placeIds = [] } = {}) => {
  const optionKey = optionKeys.length ? z.enum(optionKeys) : z.literal('none');
  const placeId = placeIds.length ? z.enum(placeIds) : z.literal('none');
  return z.object({
    reply: z.string().min(1).max(1200),
    option_notes: z
      .array(z.object({ option_key: optionKey, headline: z.string().max(80), why: z.string().max(300) }))
      .max(optionKeys.length),
    recommended_place_ids: z.array(placeId).max(placeIds.length),
    tips: z.array(z.string().max(160)).max(4),
    warnings: z.array(z.string().max(160)).max(3),
    follow_up_suggestions: z.array(z.string().max(80)).max(3),
  });
};

// ── Agent trả lời câu hỏi về 1 địa điểm ──
// source chỉ được là nguồn có trong dữ liệu gửi kèm; unknown_topics = điều người dùng hỏi mà dữ liệu không có.
export const placeAnswerSchema = z.object({
  answer: z.string().min(1).max(900),
  facts_used: z.array(z.object({ source: z.enum(Object.values(PLACE_INFO_SOURCES)), fact: z.string().max(200) })).max(6),
  unknown_topics: z.array(z.enum(PLACE_QUESTION_TOPICS)).max(PLACE_QUESTION_TOPICS.length),
  follow_up_suggestions: z.array(z.string().max(80)).max(3),
});

// Chế độ strict của Groq KHÔNG hỗ trợ các ràng buộc này (console.groq.com/docs/structured-outputs) => gỡ khỏi schema gửi đi.
// Không mất kiểm soát: server vẫn kiểm tra output bằng chính schema Zod (đủ ràng buộc), sai thì yêu cầu model sửa.
const UNSUPPORTED_KEYWORDS = new Set(['$schema', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']);

const stripUnsupported = (node) => {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (!node || typeof node !== 'object') return node;
  const result = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_KEYWORDS.has(key)) continue;
    if (key === 'const') result.enum = [value]; // dùng enum 1 giá trị cho chắc chắn được hỗ trợ
    else result[key] = key === 'properties' ? Object.fromEntries(Object.entries(value).map(([name, child]) => [name, stripUnsupported(child)])) : stripUnsupported(value);
  }
  return result;
};

// JSON Schema gửi Groq: mọi trường required + additionalProperties:false (Zod tự sinh), đã gỡ ràng buộc không hỗ trợ.
export const toProviderSchema = (zodSchema) => stripUnsupported(z.toJSONSchema(zodSchema));
