// Tín hiệu bổ sung cho bộ hiểu câu dự phòng (ruleInterpreter.js): thứ tự điểm dừng, bữa ăn, food tour, số điểm,
// câu hỏi về 1 địa điểm, yêu cầu không được phép, thành phố ngoài phạm vi. So trên chữ thường CÒN DẤU.
import { VISIT_ROLES } from '../../constants/tripRules.js';

const MAX_STOPS = 8;
const PUNCTUATION = '\\s,.;:!?';
// Tìm nguyên từ / cụm từ (không bắt "ăn" trong "săn", "bar" trong "barber")
const wordIndex = (text, word) => {
  const match = new RegExp(`(^|[${PUNCTUATION}])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[${PUNCTUATION}])`).exec(text);
  return match ? match.index + match[1].length : -1;
};

// ── Thứ tự điểm dừng: "ăn trưa rồi đi cà phê" => [meal, drink] ──
const ROLE_WORDS = {
  [VISIT_ROLES.SNACK]: ['ăn vặt', 'tráng miệng', 'chè', 'kem', 'bánh mì', 'bánh tráng', 'xôi', 'bánh ngọt', 'ăn nhẹ'],
  [VISIT_ROLES.DRINK]: ['cà phê', 'cafe', 'cafê', 'coffee', 'cf', 'trà sữa', 'uống', 'bar', 'pub', 'bia', 'trà', 'sinh tố', 'nước'],
  [VISIT_ROLES.MEAL]: ['ăn trưa', 'ăn tối', 'ăn sáng', 'ăn khuya', 'ăn cơm', 'nhà hàng', 'lẩu', 'ốc', 'phở', 'bún', 'cơm', 'hải sản', 'nướng', 'buffet', 'nhậu', 'ăn'],
  [VISIT_ROLES.ACTIVITY]: ['tham quan', 'bảo tàng', 'công viên', 'xem phim', 'mua sắm', 'dạo', 'đi dạo', 'chùa', 'nhà thờ', 'check-in', 'chụp ảnh', 'karaoke', 'bowling', 'chợ', 'vui chơi', 'đi chơi', 'ngắm', 'dinh', 'phố đi bộ'],
};
const SEQUENCE_SPLIT = /\s*,?\s*(?:rồi|xong rồi|xong|sau đó|tiếp theo|tiếp đến|cuối cùng|kế đó|sau cùng)\s+/;

const roleOf = (part) => {
  let best = null;
  for (const [role, words] of Object.entries(ROLE_WORDS)) {
    for (const word of words) {
      const index = wordIndex(part, word);
      // cụm sớm nhất thắng; cùng vị trí thì cụm dài hơn thắng ("ăn vặt" hơn "ăn")
      if (index >= 0 && (!best || index < best.index || (index === best.index && word.length > best.length))) best = { role, index, length: word.length };
    }
  }
  return best?.role ?? null;
};

export const extractSequence = (lower) => {
  const parts = lower.split(SEQUENCE_SPLIT).filter(Boolean);
  if (parts.length < 2) return [];
  const roles = parts.map(roleOf);
  return roles.every(Boolean) ? roles.slice(0, MAX_STOPS) : [];
};

// ── Bữa ăn ──
const MEAL_PATTERNS = {
  breakfast: /(ăn|bữa|điểm tâm)\s*sáng/,
  lunch: /(ăn|bữa|cơm)\s*trưa/,
  dinner: /(ăn|bữa|cơm)\s*tối/,
  late_night: /ăn\s*(khuya|đêm)/,
};
export const extractMeals = (lower) => Object.keys(MEAL_PATTERNS).filter((meal) => MEAL_PATTERNS[meal].test(lower));

export const isFoodTour = (lower) => /(food ?tour|tour ăn|ăn vặt|ăn hết|ăn sập|ăn nhiều món|lang thang ăn|càn quét|ăn xuyên)/.test(lower);

// "2 chỗ", "2-3 quán" => lấy số lớn
export const extractStopCount = (lower) => {
  const match = lower.match(/(\d{1,2})\s*(?:(?:-|–|đến|tới)\s*(\d{1,2}))?\s*(chỗ|quán|điểm|địa điểm|nơi)(?=$|[\s,.;!?])/);
  if (!match) return null;
  return Math.min(MAX_STOPS, Math.max(1, Number(match[2] ?? match[1])));
};

// ── Hỏi về 1 địa điểm cụ thể ──
const TOPIC_PATTERNS = {
  hours: /(mở cửa|đóng cửa|mấy giờ mở|giờ mở|mở tới|mở đến|còn mở|có mở)/,
  price: /(giá vé|vé vào|bao nhiêu tiền|giá bao nhiêu|giá cả|mắc không|đắt không|tốn bao nhiêu|vé bao nhiêu)/,
  address: /(ở đâu|địa chỉ|nằm ở)/,
  contact: /(số điện thoại|sđt|liên hệ|website|fanpage)/,
  about: /(có gì|lịch sử|giới thiệu|là gì|có hay không|có đẹp không|nổi tiếng|xây năm|xây dựng|ý nghĩa)/,
  rating: /(đánh giá|review|mấy sao|có ngon không|có tốt không)/,
  weather: /(thời tiết|có mưa|mưa không|nắng không|trời có)/,
  directions: /(đường đi|chỉ đường|đi bằng gì|bao xa|mất bao lâu|cách đây)/,
};
const FILLER = /^(cho (mình|tôi|em|tớ|anh|chị) hỏi|cho hỏi|hỏi chút|bạn ơi|mapmate ơi|(mình|tôi|em) muốn hỏi)[,\s]*/i;
const NAME_END = /(\s+(có|thì|là|vậy|nhỉ|không|mấy|bao|thế nào|ra sao|tối nay|hôm nay|ngày mai|bây giờ|cuối tuần)\b|[,?!.]).*$/i;
const BEFORE_NAME = /(?:^|\s)(?:đi|đến|tới|ghé|ở|tại|của|về)\s+(?=\p{Lu})/gu;

const cleanName = (raw) => {
  let name = raw.replace(FILLER, '').replace(NAME_END, '').trim();
  const cuts = [...name.matchAll(BEFORE_NAME)];
  if (cuts.length) name = name.slice(cuts.at(-1).index + cuts.at(-1)[0].length);
  const firstCapital = name.search(/\p{Lu}/u); // "quán Ốc Oanh" => "Ốc Oanh"
  if (firstCapital < 0) return null;
  name = name.slice(firstCapital).trim();
  return name.length >= 3 ? name.slice(0, 80) : null;
};

/** @returns {{ place_name: string|null, topics: string[] } | null} — null = không phải câu hỏi về địa điểm */
export const detectPlaceQuestion = (text, lower) => {
  const hits = Object.entries(TOPIC_PATTERNS)
    .map(([topic, pattern]) => ({ topic, index: lower.search(pattern) }))
    .filter((hit) => hit.index >= 0)
    .sort((a, b) => a.index - b.index);
  if (!hits.length) return null;
  const topics = hits.map((hit) => hit.topic);
  // Tên nằm trước câu hỏi ("Dinh Độc Lập mở cửa mấy giờ") hoặc sau "của / ở / tại" ("giờ mở cửa của Dinh Độc Lập")
  const after = text.slice(hits[0].index).match(/(?:của|ở|tại)\s+(\p{Lu}.*)$/u)?.[1];
  const placeName = cleanName(text.slice(0, hits[0].index)) ?? (after ? cleanName(after) : null);
  if (!placeName && !topics.includes('weather')) return null;
  return { place_name: placeName, topics };
};

// ── Không được phép / ngoài phạm vi ──
const NOT_ALLOWED = [
  { pattern: /(ma tuý|ma túy|cần sa|thuốc lắc|bay lắc|kẹo ke|cỏ mỹ|heroin|cocaine|chất cấm)/, reason: 'MapMate không hỗ trợ tìm chất cấm.' },
  { pattern: /(gái gọi|gái bao|mua dâm|mại dâm|bán dâm|kích dục|happy ending|tay vịn)/, reason: 'MapMate không hỗ trợ dịch vụ người lớn / mại dâm.' },
  { pattern: /(sòng bạc|đánh bạc|cá độ|lô đề|đánh bài ăn tiền|xóc đĩa)/, reason: 'MapMate không hỗ trợ tìm chỗ cờ bạc.' },
  { pattern: /(mua súng|vũ khí|đánh nhau|trộm|cướp|đua xe|trốn công an)/, reason: 'MapMate không hỗ trợ yêu cầu có thể gây nguy hiểm hoặc phạm pháp.' },
  { pattern: /(^|[\s,.!?])(đm|đmm|địt|đéo|cặc|lồn|óc chó|thằng ngu|con ngu|ngu như)($|[\s,.!?])/, reason: 'Mình sẵn lòng giúp, nhưng mong bạn nói chuyện lịch sự hơn nhé.' },
];
export const detectNotAllowed = (lower) => NOT_ALLOWED.find((rule) => rule.pattern.test(lower))?.reason ?? null;

const OTHER_CITIES = /(hà nội|đà nẵng|đà lạt|nha trang|vũng tàu|phú quốc|hội an|(?<!bò )huế|sa ?pa|cần thơ|hạ long|quy nhơn|phan thiết|mũi né|bangkok|singapore|seoul|tokyo)/;
const HCMC_HINTS = /(sài gòn|saigon|tp\.? ?hcm|hồ chí minh|thủ đức|quận|bình thạnh|phú nhuận|gò vấp|tân bình)/;
export const mentionsOtherCity = (lower) => OTHER_CITIES.test(lower) && !HCMC_HINTS.test(lower);
