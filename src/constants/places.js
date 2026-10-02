// Từ vựng dùng chung cho bộ lọc Khám phá, bộ lên lộ trình và AI Planner.
// Frontend lấy qua GET /api/places/filter-options => chỉ cần sửa ở đây.

// Toàn bộ giá trị hợp lệ của Place.category (khớp enum trong models/Place.model.js)
export const PLACE_CATEGORY_VALUES = ['food', 'cafe', 'attraction', 'entertainment', 'shopping', 'hotel', 'transport', 'other'];

// Các loại hình hiển thị trong bộ lọc "đi chơi"
export const EXPLORE_CATEGORIES = [
  { value: 'food', label: 'Ăn uống', emoji: '🍜' },
  { value: 'cafe', label: 'Cà phê', emoji: '☕' },
  { value: 'attraction', label: 'Tham quan', emoji: '🏛️' },
  { value: 'entertainment', label: 'Giải trí', emoji: '🎭' },
  { value: 'shopping', label: 'Mua sắm', emoji: '🛍️' },
];

// Phong cách / dịp đi chơi (Place.tags)
export const PLACE_TAGS = [
  { value: 'hen-ho', label: 'Hẹn hò', emoji: '💕' },
  { value: 'gia-dinh', label: 'Gia đình', emoji: '👨‍👩‍👧' },
  { value: 'nhom-ban', label: 'Nhóm bạn', emoji: '🎉' },
  { value: 'mot-minh', label: 'Một mình', emoji: '🎧' },
  { value: 'song-ao', label: 'Sống ảo', emoji: '📸' },
  { value: 'yen-tinh', label: 'Yên tĩnh', emoji: '🌿' },
  { value: 'ngoai-troi', label: 'Ngoài trời', emoji: '☀️' },
  { value: 'may-lanh', label: 'Máy lạnh', emoji: '❄️' },
  { value: 've-dem', label: 'Về đêm', emoji: '🌙' },
  { value: 'dac-san', label: 'Đặc sản', emoji: '🥢' },
  { value: 'binh-dan', label: 'Bình dân', emoji: '💸' },
  { value: 'sang-trong', label: 'Sang trọng', emoji: '✨' },
];
export const PLACE_TAG_VALUES = PLACE_TAGS.map((tag) => tag.value);

export const PLACE_SORTS = [
  { value: 'distance', label: 'Gần nhất' },
  { value: 'rating', label: 'Đánh giá cao' },
  { value: 'popular', label: 'Phổ biến' },
  { value: 'price_asc', label: 'Giá thấp trước' },
];
export const PLACE_SORT_VALUES = PLACE_SORTS.map((sort) => sort.value);

export const PRICE_FILTER = { min: 0, max: 2000000, step: 10000 }; // đ / người / điểm (kéo hết = "2.000k+")
export const TRIP_BUDGET_FILTER = { min: 50000, max: 2000000, step: 50000, default: 500000 }; // đ / người / cả chuyến
export const RADIUS_FILTER = { min: 1, max: 20, default: 5 }; // km
export const PEOPLE_FILTER = { min: 1, max: 20, default: 2 };
export const DURATION_FILTER = { min: 1, max: 12, default: 4 }; // giờ
export const MIN_RATING_PRESETS = [3, 4, 4.5];

export const PLACE_SEARCH_DEFAULT_LIMIT = 12;
export const PLACE_SEARCH_MAX_LIMIT = 40;

// Trung tâm Quận 1 — dùng khi người dùng chưa cho phép định vị. [lng, lat]
export const DEFAULT_ORIGIN = { lng: 106.7009, lat: 10.7769 };
export const DEFAULT_VISIT_MINUTES = 60;
