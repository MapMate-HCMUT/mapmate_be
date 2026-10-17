// Bộ hiểu câu dự phòng (không dùng LLM): chạy khi chưa có GROQ_API_KEY hoặc Groq lỗi.
// Bắt các tín hiệu phổ biến trong câu tiếng Việt: ngân sách ("500k", "1tr2", "1 triệu cả nhóm"), giờ ("7h tối", "tối nay"),
// số người, món ăn, phong cách, quận, phương tiện. Kém LLM ở câu phức tạp nhưng luôn trả đúng schema.
import { AI_INTENTS, AI_PLACE_ROLES, REQUEST_QUALITY } from '../../constants/ai.js';
import { MALL_TRIP_KEYWORD, MALL_TRIP_WORDS } from '../../constants/venues.js';
import { SAFETY_CATEGORIES, SAFETY_REPLIES } from '../../constants/aiSafety.js';
import { moderateByRules } from './safety/ruleModeration.js';
import { DISTRICT_NAMES } from '../../utils/district.js';
import { normalizeSearchText } from '../../utils/text.js';
import { interpretationSchema } from './aiSchemas.js';
import { questionsFor } from './clarifyQuestions.js';
import { detectPlaceQuestion, extractMeals, extractSequence, extractStopCount, isFoodTour, mentionsOtherCity } from './ruleSignals.js';

const THOUSAND = 1000;
const MILLION = 1000000;
const NOON = 12;

// Từ khoá -> loại hình / phong cách / phương tiện (so trên chữ thường CÒN DẤU để phân biệt "phở" với "phố")
// "quán" đứng một mình không phải quán ĂN ("quán cà phê nào gần tôi") => chỉ "quán ăn" mới tính là ăn uống
export const CATEGORY_WORDS = {
  food: ['ăn', 'quán ăn', 'nhà hàng', 'lẩu', 'ốc', 'phở', 'bún', 'cơm', 'bánh mì', 'hải sản', 'nướng', 'buffet', 'đói', 'ăn tối', 'ăn trưa', 'ăn sáng', 'ăn vặt'],
  cafe: ['cà phê', 'cafe', 'cafê', 'coffee', 'cf', 'trà sữa', 'trà', 'kem', 'chè', 'sinh tố'],
  attraction: ['tham quan', 'bảo tàng', 'chùa', 'nhà thờ', 'di tích', 'check-in', 'check in', 'ngắm cảnh', 'tượng đài', 'hoàng hôn', 'ngắm'],
  entertainment: ['xem phim', 'rạp', 'karaoke', 'bar', 'pub', 'bia', 'nhậu', 'acoustic', 'nhạc sống', 'game', 'bowling', 'giải trí'],
  park: ['công viên', 'khu vui chơi', 'sở thú', 'thảo cầm viên', 'suối tiên', 'đầm sen', 'công viên nước', 'dã ngoại', 'picnic'],
  shopping: ['mua sắm', 'shopping', 'chợ', 'mall', 'trung tâm thương mại', 'vincom', 'aeon', 'nhà sách'],
};
const TAG_WORDS = {
  'hen-ho': ['hẹn hò', 'người yêu', 'bạn gái', 'bạn trai', 'crush', 'lãng mạn', 'date', 'vợ chồng'],
  'gia-dinh': ['gia đình', 'cả nhà', 'con nhỏ', 'trẻ con', 'các bé', 'bố mẹ', 'ông bà'],
  'nhom-ban': ['nhóm', 'hội bạn', 'đám bạn', 'cả lớp', 'team', 'đồng nghiệp'],
  'mot-minh': ['một mình', '1 mình', 'solo'],
  'song-ao': ['sống ảo', 'chụp hình', 'chụp ảnh', 'check-in', 'check in', 'view đẹp'],
  'yen-tinh': ['yên tĩnh', 'làm việc', 'học bài', 'đọc sách', 'chill', 'thư giãn'],
  'ngoai-troi': ['ngoài trời', 'dã ngoại', 'picnic', 'đi dạo', 'hoàng hôn'],
  'may-lanh': ['máy lạnh', 'điều hoà', 'mát mẻ'],
  've-dem': ['đêm', 'khuya', 'về đêm', 'nhậu'],
  'dac-san': ['đặc sản', 'món ngon', 'nổi tiếng'],
  'binh-dan': ['rẻ', 'bình dân', 'sinh viên', 'tiết kiệm', 'hạt dẻ'],
  'sang-trong': ['sang', 'cao cấp', 'sang trọng', 'fine dining', 'rooftop'],
};
const VEHICLE_WORDS = { bike: ['xe máy', 'xe may', 'honda'], car: ['ô tô', 'xe hơi', 'oto', 'taxi'], walk: ['đi bộ'], public: ['xe buýt', 'xe bus', 'buýt', 'buyt', 'bus', 'metro', 'công cộng'] };
export const DISH_WORDS = ['lẩu', 'ốc', 'phở', 'bún bò', 'bún đậu', 'cơm tấm', 'bánh mì', 'hải sản', 'nướng', 'bbq', 'chay', 'sushi', 'pizza', 'trà sữa', 'bánh xèo', 'hủ tiếu', 'dimsum', 'rooftop', 'acoustic', 'buffet'];
const PART_OF_DAY = { sáng: '08:00', trưa: '11:30', chiều: '14:30', tối: '18:30', đêm: '20:30', khuya: '21:30' };
const REFINE_WORDS = /(rẻ hơn|đắt hơn|gần hơn|xa hơn|sớm hơn|muộn hơn|trễ hơn|thêm|bớt|bỏ|đổi|thay|ít hơn|nhiều hơn|khác đi|cái khác)/;
export const FIND_WORDS = /((quán|chỗ|nơi|tiệm)(\s+\S+){0,3}\s+nào|ở đâu|tìm (giúp|cho|quán|chỗ)|gợi ý (vài|mấy|1|một) ?(quán|chỗ|nơi)|có quán)/;
const PLAN_WORDS = /(lộ trình|lịch trình|kế hoạch|đi chơi|đi đâu|tour|hành trình|plan)/;
const SMALLTALK = /^(xin chào|chào|hi|hello|hey|alo|cảm ơn|cám ơn|thanks?|ok|oke)\b/;
const SMALLTALK_MAX_LENGTH = 30;
/** Chào hỏi / cảm ơn ngắn, không kèm nhu cầu => bộ điều phối trả lời luôn, không gọi LLM hiểu yêu cầu */
export const isPlainSmalltalk = (text) => {
  const lower = text.trim().toLowerCase();
  return lower.length < SMALLTALK_MAX_LENGTH && SMALLTALK.test(lower) && !/(đi|ăn|quán|chỗ|lộ trình|uống|chơi)/.test(lower);
};
const STOP_AFTER_NAME = '(?=\\s+(?:đi|muốn|thì|rồi|và|với|lúc|khoảng|tầm|ngân sách|cho)\\b|[,.;!?]|$)';

const hasAny = (text, words) => words.some((word) => text.includes(word));
const pad = (value) => String(value).padStart(2, '0');

const parseMoney = (amount, unit) => {
  const value = Number(amount.replace(',', '.'));
  if (/^(tr|triệu|củ|m)$/.test(unit)) return Math.round(value * MILLION);
  if (/^(k|nghìn|ngàn|n)$/.test(unit)) return Math.round(value * THOUSAND);
  return Math.round(value);
};

// "500k/người", "1tr2", "1.5 triệu cả nhóm", "300.000đ"
const extractBudget = (lower) => {
  const shorthand = lower.match(/(\d+)\s*(tr|triệu|củ)\s*(\d)\b/); // 1tr2 = 1.200.000
  const match = shorthand ?? lower.match(/(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|củ|đ|vnđ|vnd)\b/) ?? lower.match(/(\d{1,3}(?:\.\d{3})+)\s*(đ|vnd)?/);
  if (!match) return {};
  let amount = shorthand ? Number(match[1]) * MILLION + Number(match[3]) * (MILLION / 10) : parseMoney(match[1].replace(/\.(?=\d{3})/g, ''), match[2] ?? 'đ');
  if (amount < THOUSAND) amount *= THOUSAND; // "ngân sách 500" => 500k
  // "1 triệu cả nhà", "1tr2 cho 3 người" = tổng cả nhóm; "500k/người", "mỗi người 300k" = theo đầu người
  const isTotal = /(tổng|cả nhóm|cả nhà|tất cả|cho cả|chung|cho \d+ (người|đứa))/.test(lower) && !/(\/\s*người|mỗi người|1 người|một người|\/ng)/.test(lower);
  return isTotal ? { budget_total: amount } : { budget_per_person: amount };
};

export const extractTime = (lower) => {
  const clock = lower.match(/(\d{1,2})\s*(?::|h|giờ|g)\s*(\d{2})?\s*(sáng|trưa|chiều|tối|đêm)?/);
  if (clock && !/\d+\s*(tiếng|giờ đồng hồ)/.test(clock[0])) {
    let hour = Number(clock[1]);
    if (['chiều', 'tối', 'đêm'].includes(clock[3]) && hour < NOON) hour += NOON;
    if (hour <= 23) return `${pad(hour)}:${pad(clock[2] ?? 0)}`;
  }
  const part = Object.keys(PART_OF_DAY).find((word) => lower.includes(word));
  return part ? PART_OF_DAY[part] : null;
};

// "về trước 22h", "xong trước 9h tối", "kết thúc trước 10 giờ" => giờ KẾT THÚC (không phải giờ đi).
// Trả cả câu đã bỏ cụm đó để bước bắt giờ đi không hiểu nhầm "22h" là giờ xuất phát (lỗi người dùng gặp).
const END_BY = /(?:về|xong|kết thúc|tan)?\s*(?:trước|không quá|chậm nhất(?: là)?)\s*(\d{1,2})\s*(?::|h|giờ|g)\s*(\d{2})?\s*(sáng|trưa|chiều|tối|đêm)?/;
const EVENING_GUESS_MAX_HOUR = 6; // "về trước 6h" (không nói buổi) => 18:00
export const extractEndBy = (lower) => {
  const match = lower.match(END_BY);
  if (!match) return { endBy: null, rest: lower };
  let hour = Number(match[1]);
  if ((['chiều', 'tối', 'đêm'].includes(match[3]) && hour < NOON) || (!match[3] && hour <= EVENING_GUESS_MAX_HOUR)) hour += NOON;
  if (hour > 23) return { endBy: null, rest: lower };
  return { endBy: `${pad(hour)}:${pad(match[2] ?? 0)}`, rest: lower.replace(match[0], ' ') };
};

// ── Sửa 1 lộ trình có sẵn: "đổi quán ăn thành quán chay", "bỏ điểm 2", "thêm 1 quán cà phê", "sắp xếp lại" ──
const ROLE_WORDS = [
  ['snack', /(ăn vặt|tráng miệng|chè|kem\b)/],
  ['drink', /(cà phê|cafe|cf\b|trà sữa|đồ uống|chỗ uống|quán nước|\bbar\b)/],
  ['meal', /(quán ăn|chỗ ăn|nhà hàng|bữa (chính|tối|trưa|sáng)|ăn tối|ăn trưa|quán lẩu|quán nướng)/],
  ['activity', /(chỗ chơi|điểm chơi|tham quan|vui chơi|bảo tàng|công viên|mua sắm|ngắm)/],
];
const roleOf = (phrase) => ROLE_WORDS.find(([, pattern]) => pattern.test(phrase))?.[0] ?? null;
const stopNumberOf = (phrase) => Number(phrase.match(/(?:điểm|chỗ|quán|địa điểm)\s*(?:số|thứ)?\s*(\d)\b/)?.[1]) || null;
const dishOf = (phrase) => DISH_WORDS.find((word) => phrase.includes(word)) ?? null;
const CLAUSE_END = '(?=[,.;!?]|\\s+(?:mà|nhưng|và|rồi|với)\\s|$)';
const REPLACE_EDIT = new RegExp(`(?:đổi|thay)\\s+(.+?)\\s+(?:thành|sang|bằng)\\s+(.+?)${CLAUSE_END}`);
const REMOVE_EDIT = /(?:bỏ|xoá|xóa|bớt)\s+(?:đi\s+)?((?:điểm|chỗ|quán)\s*(?:số|thứ)?\s*\d\b|quán ăn|chỗ ăn|nhà hàng|quán cà phê|cà phê|chỗ uống|ăn vặt|chỗ chơi|bảo tàng|công viên)/;
const ADD_EDIT = new RegExp(`thêm\\s+(.+?)${CLAUSE_END}`);
const REORDER = /(sắp xếp lại|sắp lại|tối ưu|đỡ (chạy|đi) vòng|thứ tự hợp lý|đi cho thuận)/;

const edit = (action, fields) => ({ action, stop_number: null, target_name: null, target_role: null, keyword: null, new_role: null, ...fields });
export const extractEdits = (lower) => {
  const edits = [];
  const replace = lower.match(REPLACE_EDIT);
  if (replace) {
    const target = { stop_number: stopNumberOf(replace[1]), target_role: roleOf(replace[1]) };
    const keyword = dishOf(replace[2]);
    if ((target.stop_number || target.target_role) && (keyword || roleOf(replace[2]))) edits.push(edit('replace', { ...target, keyword, new_role: roleOf(replace[2]) }));
  }
  const remove = lower.match(REMOVE_EDIT);
  if (remove) edits.push(edit('remove', { stop_number: stopNumberOf(remove[1]), target_role: stopNumberOf(remove[1]) ? null : roleOf(remove[1]) ?? (/(quán ăn|chỗ ăn|nhà hàng)/.test(remove[1]) ? 'meal' : null) }));
  const add = lower.match(ADD_EDIT);
  if (add) {
    const keyword = dishOf(add[1]);
    const role = roleOf(add[1]) ?? (keyword ? 'meal' : null);
    if (role) edits.push(edit('add', { keyword, new_role: role }));
  }
  return edits.filter((item) => item.stop_number || item.target_role || item.action === 'add');
};

export const extractDateHint = (lower) => {
  if (/(bây giờ|ngay bây giờ|liền|luôn bây giờ|right now)/.test(lower)) return 'now';
  if (/(tối nay|đêm nay)/.test(lower)) return 'tonight';
  if (/(ngày mai|sáng mai|chiều mai|tối mai|\bmai\b)/.test(lower)) return 'tomorrow';
  if (/(cuối tuần|thứ 7|thứ bảy|chủ nhật|weekend)/.test(lower)) return 'weekend';
  if (/(hôm nay|chiều nay|trưa nay|sáng nay)/.test(lower)) return 'today';
  return 'unspecified';
};

export const extractDuration = (lower) => {
  const hours = lower.match(/(\d{1,2})\s*(tiếng|giờ đồng hồ|h đồng hồ)/);
  if (hours) return Math.min(12, Math.max(1, Number(hours[1])));
  if (/cả ngày/.test(lower)) return 8;
  if (/nửa ngày|buổi (sáng|chiều|tối)/.test(lower)) return 4;
  return null;
};

const extractPeople = (lower) => {
  const count = lower.match(/(\d{1,2})\s*(người|ng\b|đứa|bạn|thành viên|khách|anh em|chị em)/);
  if (count) return Math.min(20, Math.max(1, Number(count[1])));
  if (/(một mình|1 mình|solo)/.test(lower)) return 1;
  if (/(hẹn hò|người yêu|bạn gái|bạn trai|vợ chồng|cặp đôi|2 đứa)/.test(lower)) return 2;
  return null;
};

export const extractDistrict = (lower, plain) => {
  const numbered = plain.match(/\b(?:quan|q\.?|district)\s*(\d{1,2})\b/);
  if (numbered) return `Quận ${Number(numbered[1])}`;
  return DISTRICT_NAMES.find((name) => !name.startsWith('Quận') && lower.includes(name.toLowerCase())) ?? null;
};

// Tên riêng sau "xuất phát từ / đang ở / gần / ghé..." — chỉ lấy cụm có chữ hoa đầu để tránh bắt nhầm cụm thường.
const extractPlaces = (text, district) => {
  const found = [];
  const collect = (pattern, role) => {
    for (const match of text.matchAll(pattern)) {
      const name = match[1].trim();
      const isDistrict = district && normalizeSearchText(name).includes(normalizeSearchText(district));
      const isCount = /^\d+\s*(chỗ|quán|điểm|nơi|người)/.test(name) || /^(điểm|chỗ|quán|địa điểm)\s*(số|thứ)?\s*\d/i.test(name); // "đi 3 chỗ", "bỏ điểm 2" không phải tên
      if (name.length >= 3 && /^[A-ZĐÀ-Ỹ0-9]/.test(name) && !isDistrict && !isCount) found.push({ name: name.slice(0, 80), role });
    }
  };
  collect(new RegExp(`(?:xuất phát từ|đi từ|bắt đầu từ|đang ở|từ)\\s+([^,.;!?]+?)${STOP_AFTER_NAME}`, 'gi'), AI_PLACE_ROLES.ORIGIN);
  collect(new RegExp(`(?:gần|quanh|khu vực|khu)\\s+([^,.;!?]+?)${STOP_AFTER_NAME}`, 'gi'), AI_PLACE_ROLES.NEAR);
  collect(new RegExp(`(?:ghé|ghé qua|phải đi|muốn đi|đi|đến|tới|qua|vào)\\s+([^,.;!?]+?)${STOP_AFTER_NAME}`, 'gi'), AI_PLACE_ROLES.MUST_VISIT);
  collect(new RegExp(`(?:bỏ|đừng đi|không đi|tránh)\\s+([^,.;!?]+?)${STOP_AFTER_NAME}`, 'gi'), AI_PLACE_ROLES.AVOID);
  return found.slice(0, 6);
};

const detectIntent = (lower, { hasPrevious, signals }) => {
  if (SMALLTALK.test(lower) && lower.length < 30) return AI_INTENTS.SMALLTALK;
  if (hasPrevious && REFINE_WORDS.test(lower) && !PLAN_WORDS.test(lower)) return AI_INTENTS.REFINE_TRIP;
  if (FIND_WORDS.test(lower) && !PLAN_WORDS.test(lower)) return AI_INTENTS.FIND_PLACES;
  if (PLAN_WORDS.test(lower) || signals > 0) return AI_INTENTS.PLAN_TRIP;
  return AI_INTENTS.ASK_INFO;
};

// Thiếu đến mức gợi ý sẽ vô nghĩa ("đi chơi") => hỏi lại; thiếu ít thì để bước sau tự giả định
const missingInfo = (criteria, hasPlaces) => {
  const missing = [];
  if (!criteria.categories.length && !criteria.tags.length && !criteria.keywords.length && !criteria.sequence.length) missing.push('activity');
  if (!criteria.district && !hasPlaces) missing.push('area');
  if (!criteria.start_time && criteria.date_hint === 'unspecified') missing.push('time');
  if (criteria.budget_per_person == null && criteria.budget_total == null && !criteria.price_level) missing.push('budget');
  if (criteria.people == null) missing.push('people');
  return missing;
};
const TOO_VAGUE = ['activity', 'area', 'time'];

const decideQuality = ({ intent, criteria, placesMentioned, askedBefore, refusal }) => {
  if (refusal) return { request_quality: REQUEST_QUALITY.NOT_ALLOWED, missing: [], clarifying_questions: [], refusal_reason: refusal };
  const missing = missingInfo(criteria, placesMentioned.length > 0);
  const vague = intent === AI_INTENTS.PLAN_TRIP && !askedBefore && TOO_VAGUE.every((key) => missing.includes(key));
  return {
    request_quality: vague ? REQUEST_QUALITY.NEEDS_INFO : REQUEST_QUALITY.OK,
    missing,
    clarifying_questions: vague ? questionsFor(missing) : [],
    refusal_reason: null,
  };
};

/** Hiểu câu theo luật => object đúng `interpretationSchema`. */
export const interpretWithRules = (text, { previousCriteria = null, askedBefore = false, hasBasePlan = false } = {}) => {
  const lower = text.toLowerCase();
  const { endBy, rest: withoutEndBy } = extractEndBy(lower);
  const plain = normalizeSearchText(text);
  const district = extractDistrict(lower, plain);
  const foodTour = isFoodTour(lower);
  const categories = Object.entries(CATEGORY_WORDS).filter(([category, words]) => hasAny(lower, words) || (foodTour && category === 'food')).map(([category]) => category);
  const tags = Object.entries(TAG_WORDS).filter(([, words]) => hasAny(lower, words)).map(([tag]) => tag);
  const vehicle = Object.entries(VEHICLE_WORDS).find(([, words]) => hasAny(lower, words))?.[0] ?? null;
  const meals = extractMeals(lower);
  const criteria = {
    categories: categories.slice(0, 6),
    tags: tags.slice(0, 6),
    people: extractPeople(lower),
    budget_per_person: null,
    budget_total: null,
    ...extractBudget(lower),
    price_level: /(rẻ hơn|rẻ|bình dân|sinh viên|hạt dẻ)/.test(lower) ? 'cheap' : /(sang|cao cấp|sang trọng)/.test(lower) ? 'upscale' : null,
    start_time: extractTime(withoutEndBy),
    end_by: endBy,
    date_hint: extractDateHint(lower),
    duration_hours: extractDuration(lower),
    vehicle,
    district,
    radius_km: /(gần hơn|gần đây|quanh đây|gần nhà)/.test(lower) ? 3 : null,
    // Chỉ lọc sao khi nói rõ ("4 sao trở lên"): phần lớn dữ liệu chưa có đánh giá, lọc theo "ngon" sẽ loại gần hết
    min_rating: Number(lower.match(/(\d(?:[.,]5)?)\s*sao/)?.[1]?.replace(',', '.')) || null,
    open_only: /(đang mở|còn mở|bây giờ|ngay)/.test(lower) ? true : null,
    keywords: [...(MALL_TRIP_WORDS.test(lower) ? [MALL_TRIP_KEYWORD] : []), ...DISH_WORDS.filter((word) => lower.includes(word))].slice(0, 5),
    sequence: extractSequence(lower),
    meals,
    food_tour: foodTour,
    stop_count: extractStopCount(lower),
  };
  const signals = [criteria.people, criteria.budget_per_person, criteria.budget_total, criteria.start_time, criteria.vehicle, district].filter((value) => value != null).length + categories.length + tags.length;
  const placeQuestion = detectPlaceQuestion(text, lower);
  const flagged = moderateByRules(text);
  const refusal = flagged ? SAFETY_REPLIES[flagged.category] : null;
  const edits = hasBasePlan || previousCriteria ? extractEdits(lower) : [];
  const reorder = (hasBasePlan || Boolean(previousCriteria)) && REORDER.test(lower);
  let intent = detectIntent(lower, { hasPrevious: Boolean(previousCriteria) || hasBasePlan, signals: signals + (endBy ? 1 : 0) });
  // Đang có lộ trình mà chỉ nói giờ về ("về trước 10h tối nhé") => sửa giờ của lộ trình đó, không lên lộ trình mới
  if (edits.length || reorder || (endBy && (hasBasePlan || previousCriteria) && !PLAN_WORDS.test(lower))) intent = AI_INTENTS.REFINE_TRIP;
  if (placeQuestion && !criteria.sequence.length) intent = AI_INTENTS.ASK_PLACE;
  if (mentionsOtherCity(lower)) intent = AI_INTENTS.OUT_OF_SCOPE;
  const placesMentioned = intent === AI_INTENTS.ASK_PLACE ? [] : extractPlaces(text, district);
  const quality = decideQuality({ intent, criteria, placesMentioned, askedBefore, refusal });
  return interpretationSchema.parse({
    intent,
    confidence: signals >= 3 ? 0.7 : signals > 0 ? 0.5 : 0.3,
    ...quality,
    ...(intent === AI_INTENTS.OUT_OF_SCOPE && !refusal ? { refusal_reason: 'MapMate hiện chỉ có dữ liệu đi chơi, ăn uống ở TP.HCM.' } : {}),
    safety_category: flagged?.category ?? SAFETY_CATEGORIES.NONE,
    criteria,
    place_question: placeQuestion ?? { place_name: null, topics: [] },
    places_mentioned: placesMentioned,
    edits,
    reorder,
  });
};
