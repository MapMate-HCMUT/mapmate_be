// Từ vựng dùng chung cho bộ lọc Khám phá, bộ lên lộ trình và AI Planner.
// Frontend lấy qua GET /api/places/filter-options => chỉ cần sửa ở đây.

// Toàn bộ giá trị hợp lệ của Place.category (khớp enum trong models/Place.model.js)
export const PLACE_CATEGORY_VALUES = ['food', 'cafe', 'attraction', 'entertainment', 'park', 'shopping', 'hotel', 'transport', 'other'];

// Các loại hình hiển thị trong bộ lọc "đi chơi"
export const EXPLORE_CATEGORIES = [
  { value: 'food', label: 'Ăn uống', emoji: '🍜' },
  { value: 'cafe', label: 'Cà phê', emoji: '☕' },
  { value: 'attraction', label: 'Tham quan', emoji: '🏛️' },
  { value: 'entertainment', label: 'Giải trí', emoji: '🎭' },
  { value: 'park', label: 'Công viên', emoji: '🎡' }, // công viên, khu vui chơi (Suối Tiên, Đầm Sen), sở thú
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
  { value: 'recommended', label: 'Đề xuất' },
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

export const DEFAULT_PLACE_SORT = 'recommended';

/**
 * Sắp xếp "Đề xuất": điểm = tổng có trọng số (cao hơn = lên trước). Dữ liệu mở có hàng chục nghìn nơi chưa ai đánh giá,
 * nên ưu tiên nơi đã kiểm chứng (có đánh giá), biết giờ mở cửa, độ tin cậy cao — rồi mới tới gần.
 */
export const RECOMMENDED_SORT_WEIGHTS = { reviewed: 1, hoursKnown: 0.25, confidence: 0.5, proximity: 0.8, maybeClosed: -0.6 };

export const PLACE_SEARCH_DEFAULT_LIMIT = 12;
export const PLACE_SEARCH_MAX_LIMIT = 40;
// Đếm tổng số kết quả tối đa tới mức này (hiện "1.000+") — đếm hết 20.000 nơi trong bán kính 20 km là lãng phí.
export const PLACE_COUNT_CAP = 1000;

// ── Trạng thái hoạt động của địa điểm (Place.status) ──
export const PLACE_STATUS = {
  ACTIVE: 'active',
  MAYBE_CLOSED: 'maybe_closed', // có người báo đóng cửa, chưa đủ xác nhận => vẫn hiện, kèm cảnh báo
  CLOSED: 'closed', // ẩn khỏi tìm kiếm + gợi ý lộ trình (bài viết cũ vẫn xem được)
};
export const PLACE_STATUS_VALUES = Object.values(PLACE_STATUS);
// Ai đánh dấu đóng cửa: nguồn dữ liệu (biến mất khỏi Overture/OSM) hay cộng đồng báo. Nhập lại chỉ mở lại loại 'source'.
export const CLOSED_BY = { SOURCE: 'source', COMMUNITY: 'community' };

// Báo đóng cửa: (số người báo "đã đóng" − số người báo "vẫn mở") trong 180 ngày gần nhất
export const PLACE_REPORT_TYPES = { CLOSED: 'closed', OPEN: 'open' };
export const PLACE_REPORT_THRESHOLDS = { maybeClosed: 1, closed: 3 };
export const PLACE_REPORT_TTL_DAYS = 180;

// Ứng viên cho bộ lên lộ trình: mỗi loại hình lấy N nơi chất lượng nhất + M nơi gần nhất trong bán kính.
export const PLANNER_CANDIDATES_PER_CATEGORY = { best: 40, nearest: 15 };

// Trung tâm Quận 1 — dùng khi người dùng chưa cho phép định vị. [lng, lat]
export const DEFAULT_ORIGIN = { lng: 106.7009, lat: 10.7769 };
export const DEFAULT_VISIT_MINUTES = 60;

// Không có kết quả => tự nới dần bộ lọc (từ điều kiện "phụ" tới "chính"), giữ nguyên ô tìm kiếm + vị trí.
// Người dùng không phải tự bấm "Đặt lại bộ lọc"; giao diện báo đã tạm bỏ những gì. Mỗi bước gộp các bước trước.
export const PLACE_RELAX_STEPS = [
  { keys: ['tags'], label: 'phong cách' },
  { keys: ['min_rating'], label: 'số sao' },
  { keys: ['open_at'], label: 'đang mở cửa' },
  { keys: ['price_min', 'price_max'], label: 'khoảng giá' },
  { keys: ['district'], label: 'quận' },
  { keys: ['categories'], label: 'loại hình' },
  { keys: ['radius_km'], label: 'bán kính', widen: true }, // không xoá mà nới tới tối đa
];
