// Bám đúng điều người dùng NÓI (code, không dùng LLM) — chạy ngay sau Agent hiểu yêu cầu. Chặn các lỗi đã gặp khi dùng thật:
//   1. Ghi nhớ "thích bún bò, hay đi Quận 5" bị model nhét vào "cafe quanh tôi" => lộ trình có quán bún bò ở Quận 5
//   2. Câu nói rõ loại chỗ ("cà phê") mà model thêm loại khác ("quán ăn") => chen quán ăn vào
//   3. Than phiền "sao hỏi cafe mà gợi ý bún bò vậy" bị hiểu thành... muốn ăn bún bò
//   4. Lọc tiếp kết quả vừa tìm ("dưới 40k đi") bị hiểu thành yêu cầu mới quá chung chung => hỏi lại "bạn muốn đi kiểu gì?"
import { AI_INTENTS, REQUEST_QUALITY } from '../../constants/ai.js';
import { normalizeSearchText } from '../../utils/text.js';
import { CATEGORY_WORDS, DISH_WORDS, extractDistrict } from './ruleInterpreter.js';

const LETTER = '\\p{L}';
const wordPattern = (word) => new RegExp(`(?:^|[^${LETTER}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[^${LETTER}]|$)`, 'u');
// Quán nhậu / bia thường xếp loại "ăn uống" trong dữ liệu => gọi "bia", "nhậu" là tìm cả 2 loại
const EXTRA_WORDS = { food: ['bia', 'nhậu', 'quán nhậu'] };
const KIND_PATTERNS = Object.entries(CATEGORY_WORDS).map(([kind, words]) => [kind, [...words, ...(EXTRA_WORDS[kind] ?? [])].map(wordPattern)]);

/** Loại chỗ người dùng gọi tên trong câu ("cà phê" => cafe, "bún bò" => food) — so trọn từ, còn dấu */
export const mentionedKinds = (text) => {
  const lower = text.toLowerCase();
  return KIND_PATTERNS.filter(([, patterns]) => patterns.some((pattern) => pattern.test(lower))).map(([kind]) => kind);
};

const tokensOf = (text) => normalizeSearchText(text).split(/[^a-z0-9]+/).filter(Boolean);
// Từ khoá có thật trong lời người dùng: cả cụm, hoặc từ đầu của nó ("ốc len xào dừa" khi người dùng gõ "ốc")
const isGrounded = (keyword, text) => {
  const needle = normalizeSearchText(keyword);
  const plain = normalizeSearchText(text);
  if (!needle) return false;
  if (plain.includes(needle)) return true;
  const [head] = tokensOf(keyword);
  return Boolean(head && head.length >= 2 && tokensOf(text).includes(head));
};

// Than phiền / phủ nhận kết quả trước — món vừa bị gợi ý mà người dùng nhắc lại trong câu này là món KHÔNG muốn
const COMPLAINT = /(mắc gì|sao lại|sao mà|tại sao|vì sao|sao (gợi ý|đưa|ra|toàn)|chứ không phải|không phải|đừng (gợi ý|đưa)|không muốn|ko muốn|hông muốn|ai hỏi)/;
const unwantedIn = (text, previousReply) => {
  const lower = text.toLowerCase();
  if (!previousReply || !COMPLAINT.test(lower)) return [];
  const before = previousReply.toLowerCase();
  return DISH_WORDS.filter((dish) => wordPattern(dish).test(lower) && before.includes(dish));
};

const removeWords = (text, words) => words.reduce((rest, word) => rest.replace(new RegExp(word, 'gi'), ' '), text);
const kindsOfKeyword = (keyword) => mentionedKinds(keyword);

/**
 * Cắt mọi thứ người dùng không nói ở lượt này (từ khoá, quận suy từ ghi nhớ) + bỏ món người dùng than phiền.
 * Chạy TRƯỚC khi ghép với yêu cầu đang chờ (yêu cầu đang chờ đã được cắt ở lượt của nó).
 */
export const groundInterpretation = (interpretation, text, { previousReply = '' } = {}) => {
  const unwanted = unwantedIn(text, previousReply);
  const said = removeWords(text, unwanted);
  const { criteria } = interpretation;
  const lower = said.toLowerCase();
  const district = criteria.district && (extractDistrict(lower, normalizeSearchText(said)) || isGrounded(criteria.district, said)) ? criteria.district : null;
  return {
    interpretation: {
      ...interpretation,
      criteria: {
        ...criteria,
        district,
        keywords: criteria.keywords.filter((keyword) => isGrounded(keyword, said) && !unwanted.some((dish) => normalizeSearchText(keyword).includes(normalizeSearchText(dish)))),
      },
    },
    unwanted,
    said,
  };
};

/**
 * Câu gọi tên loại chỗ => chỉ tìm đúng loại đó: loại hình = đúng các loại được gọi tên, từ khoá khác loại bị bỏ
 * (kể cả từ khoá ghép từ yêu cầu đang chờ). Câu không gọi tên loại nào => giữ nguyên.
 */
export const lockToMentionedKinds = (interpretation, said) => {
  const kinds = mentionedKinds(said);
  if (!kinds.length) return interpretation;
  const { criteria } = interpretation;
  const keywords = criteria.keywords.filter((keyword) => {
    const own = kindsOfKeyword(keyword);
    return !own.length || own.some((kind) => kinds.includes(kind));
  });
  return { ...interpretation, criteria: { ...criteria, categories: kinds, keywords } };
};

// Lượt trước vừa tìm quán; lượt này chỉ thêm điều kiện ("dưới 40k đi", "gần hơn", "mở tới khuya") => lọc tiếp đúng loại quán đó
const NEW_TRIP_WORDS = /(lộ trình|lịch trình|kế hoạch|hành trình|\btour\b|đi chơi|cả ngày|nửa ngày|cả buổi)/;
export const continueFind = (interpretation, said, { lastIntent, previousCriteria, lastKeywords = [] }) => {
  const { criteria } = interpretation;
  const ownActivity = mentionedKinds(said).length || criteria.keywords.length || criteria.sequence.length || criteria.meals.length || criteria.food_tour;
  if (lastIntent !== AI_INTENTS.FIND_PLACES || !previousCriteria?.categories || ownActivity || NEW_TRIP_WORDS.test(said.toLowerCase())) return null;
  if (![AI_INTENTS.PLAN_TRIP, AI_INTENTS.FIND_PLACES, AI_INTENTS.REFINE_TRIP].includes(interpretation.intent)) return null;
  return {
    ...interpretation,
    intent: AI_INTENTS.FIND_PLACES,
    request_quality: interpretation.request_quality === REQUEST_QUALITY.NOT_ALLOWED ? interpretation.request_quality : REQUEST_QUALITY.OK,
    clarifying_questions: [],
    locked_intent: true,
    criteria: {
      ...criteria,
      categories: previousCriteria.categories,
      tags: criteria.tags.length ? criteria.tags : previousCriteria.tags ?? [],
      keywords: lastKeywords,
    },
  };
};
