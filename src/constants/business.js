// Tài khoản doanh nghiệp (chủ quán / cửa hàng): đăng ký, chọn vị trí trên bản đồ, quản lý cửa hàng theo 3 gói.
// Mỗi gói khác nhau ở: số cửa hàng, dung lượng ảnh / video, và độ phủ (mức ưu tiên + bán kính được đẩy lên khi xếp "Đề xuất").
// AI Planner KHÔNG dùng các ưu tiên này: lộ trình AI vẫn chọn theo chất lượng + khoảng cách để giữ khách quan.

export const USER_ROLES = { USER: 'user', BUSINESS: 'business' };
export const USER_ROLE_VALUES = Object.values(USER_ROLES);

export const BUSINESS_TIERS = { BASIC: 'basic', GROWTH: 'growth', PREMIUM: 'premium' };
export const BUSINESS_TIER_VALUES = Object.values(BUSINESS_TIERS);
export const BUSINESS_DEFAULT_TIER = BUSINESS_TIERS.BASIC;

const MB = 1024 * 1024;
const GB = 1024 * MB;

/**
 * Đặc quyền từng gói (1 nguồn duy nhất cho server + giao diện — GET /api/businesses/tiers).
 * - boost: cộng vào điểm "Đề xuất" (thang điểm hiện tại: đã có đánh giá +1, gần +0.8...). Cao nhất = +1 (ngang "đã có đánh giá")
 *   => cửa hàng mới lên được trang đầu nhưng không vượt nơi vừa có đánh giá vừa gần hơn hẳn
 * - reach_km: chỉ được đẩy lên với người đang tìm trong bán kính này quanh cửa hàng
 * - featured: được xoay vòng ở mục "Nổi bật gần bạn" trên trang chủ (có nhãn "Tài trợ")
 */
export const BUSINESS_TIER_PERKS = {
  [BUSINESS_TIERS.BASIC]: {
    label: 'Cơ bản',
    price_vnd: 0,
    max_places: 1,
    storage_bytes: 500 * MB,
    gallery_items: 10,
    gallery_videos: 1,
    boost: 0,
    reach_km: 0,
    featured: false,
    highlight_marker: false,
    stats_days: 7,
    max_promotions: 1,
    promotion_kinds: ['deal', 'voucher'],
    notify_per_week: 0,
    highlights: ['1 cửa hàng trên bản đồ', '500MB ảnh / video', '1 khuyến mãi / voucher đang chạy', 'Trả lời đánh giá của khách', 'Thống kê 7 ngày'],
  },
  [BUSINESS_TIERS.GROWTH]: {
    label: 'Tăng trưởng',
    price_vnd: 199000,
    max_places: 3,
    storage_bytes: 2 * GB,
    gallery_items: 30,
    gallery_videos: 5,
    boost: 0.5,
    reach_km: 3,
    featured: false,
    highlight_marker: true,
    stats_days: 30,
    max_promotions: 3,
    promotion_kinds: ['deal', 'voucher', 'checkin'],
    notify_per_week: 1,
    highlights: ['Tối đa 3 cửa hàng', '2GB ảnh / video', 'Ưu tiên trong bán kính 3 km', '3 khuyến mãi + sự kiện "Check-in nhận quà"', 'Báo 1 lần / tuần cho khách đã lưu quán', 'Điểm nổi bật trên bản đồ', 'Thống kê 30 ngày'],
  },
  [BUSINESS_TIERS.PREMIUM]: {
    label: 'Nổi bật',
    price_vnd: 499000,
    max_places: 10,
    storage_bytes: 5 * GB,
    gallery_items: 60,
    gallery_videos: 15,
    boost: 1,
    reach_km: 8,
    featured: true,
    highlight_marker: true,
    stats_days: 90,
    max_promotions: 10,
    promotion_kinds: ['deal', 'voucher', 'checkin', 'lucky_wheel'],
    notify_per_week: 3,
    highlights: ['Tối đa 10 cửa hàng', '5GB ảnh / video', 'Ưu tiên trong bán kính 8 km', 'Lên mục "Nổi bật gần bạn" ở trang chủ', '10 khuyến mãi + "Vòng quay may mắn"', 'Báo 3 lần / tuần cho khách đã lưu quán', 'Thống kê 90 ngày'],
  },
};

// Chưa tích hợp cổng thanh toán: đổi gói có hiệu lực ngay (bản demo). Có cổng thanh toán => đổi gói sau khi thanh toán thành công.
export const BUSINESS_BILLING_MODE = 'demo';

export const BUSINESS_LIMITS = {
  NAME_MAX: 80,
  DESCRIPTION_MAX: 600,
  ADDRESS_MAX: 200,
  PHONE_PATTERN: /^\+[1-9]\d{7,14}$/, // E.164
  VN_PHONE_PATTERN: /^\+84([35789]\d{8}|2\d{9})$/,
  RANGES_PER_DAY: 3,
  WEBSITE_MAX: 200,
  SPECIALTIES_MAX: 8,
  SPECIALTY_MAX: 40,
  PRICE_MAX: 10_000_000,
  // Cảnh báo "có thể trùng": nơi có tên gần giống trong bán kính này (dữ liệu Overture / OSM đã có sẵn quán đó)
  DUPLICATE_RADIUS_KM: 0.15,
  DUPLICATE_LIMIT: 5,
  FEATURED_LIMIT: 6,
  FEATURED_DEFAULT_LIMIT: 4,
  // Thông báo nhanh trên thẻ cửa hàng ("Hôm nay nghỉ", "Đóng cửa sớm 20h"...) — luôn có hạn để không bị quên treo mãi
  NOTICE_MAX: 120,
  NOTICE_MAX_DAYS: 30,
  REPLY_MAX: 500,
  REVIEWS_PAGE: 20,
};

// Khuyến mãi = công cụ quảng cáo của chủ quán: hiện trên thẻ địa điểm, thẻ chi tiết; gói trả phí còn báo cho khách đã lưu quán
export const PROMOTION_LIMITS = {
  TITLE_MAX: 60,
  LABEL_MAX: 16, // "-20%", "Mua 1 tặng 1"
  DESCRIPTION_MAX: 300,
  CODE_MAX: 20,
  MAX_DAYS: 30,
  NOTIFY_MAX_RECIPIENTS: 500,
};
export const PROMOTION_STATUS = { SCHEDULED: 'scheduled', ACTIVE: 'active', ENDED: 'ended' };

// Loại khuyến mãi. Các loại "săn" (voucher / checkin / lucky_wheel) phát mã riêng cho từng người, quán xác nhận khi khách dùng.
export const PROMOTION_KINDS = { DEAL: 'deal', VOUCHER: 'voucher', CHECKIN: 'checkin', LUCKY_WHEEL: 'lucky_wheel' };
export const PROMOTION_KIND_VALUES = Object.values(PROMOTION_KINDS);
export const HUNT_KINDS = [PROMOTION_KINDS.VOUCHER, PROMOTION_KINDS.CHECKIN, PROMOTION_KINDS.LUCKY_WHEEL];
export const PROMOTION_KIND_LABELS = {
  deal: 'Ưu đãi',
  voucher: 'Voucher giới hạn',
  checkin: 'Check-in nhận quà',
  lucky_wheel: 'Vòng quay may mắn',
};
export const VOUCHER_LIMITS = {
  QUANTITY_MAX: 1000,
  PRIZES_MAX: 6,
  PRIZE_LABEL_MAX: 30,
  WEIGHT_MAX: 100,
  CHECKIN_RADIUS_M: 200, // phải đứng cách quán ≤ 200 m mới mở được quà check-in
  EVENTS_RADIUS_KM: 10, // "Săn voucher gần bạn"
  EVENTS_UPCOMING_DAYS: 3, // sự kiện sắp mở trong 3 ngày tới cũng hiện (đếm ngược)
  EVENTS_LIMIT: 30,
  CODE_LENGTH: 8,
  CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I dễ đọc nhầm khi đọc mã cho quán
  WALLET_LIMIT: 50,
};
export const VOUCHER_STATUS = { CLAIMED: 'claimed', USED: 'used', LOST: 'lost' }; // lost = quay trượt (vẫn ghi để tính lượt / ngày)

// Danh mục cửa hàng được tự đăng (không cho tự đăng "transport" / "other")
export const BUSINESS_PLACE_CATEGORIES = ['food', 'cafe', 'entertainment', 'shopping', 'attraction', 'park'];

// Thống kê cửa hàng (collection business_stats, 1 dòng / cửa hàng / ngày)
export const BUSINESS_STAT_EVENTS = { VIEW: 'view', IMPRESSION: 'impression', DIRECTIONS: 'directions' };
export const BUSINESS_STAT_FIELDS = { view: 'views', impression: 'impressions', directions: 'directions' };
// Mỗi người xem chỉ tính 1 lượt / cửa hàng / loại / ngày (chống bấm liên tục để thổi số)
export const BUSINESS_STAT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;
export const BUSINESS_STAT_RETENTION_DAYS = 120;

export const BUSINESS_ERROR_CODES = {
  BUSINESS_REQUIRED: 'BUSINESS_REQUIRED', // chưa đăng ký tài khoản doanh nghiệp
  BUSINESS_EXISTS: 'BUSINESS_EXISTS',
  BUSINESS_PLACE_LIMIT: 'BUSINESS_PLACE_LIMIT', // vượt số cửa hàng của gói
  BUSINESS_STORAGE_LIMIT: 'BUSINESS_STORAGE_LIMIT', // vượt dung lượng ảnh / video của gói
  BUSINESS_GALLERY_LIMIT: 'BUSINESS_GALLERY_LIMIT', // vượt số ảnh / video mỗi cửa hàng
  BUSINESS_DOWNGRADE_BLOCKED: 'BUSINESS_DOWNGRADE_BLOCKED',
  BUSINESS_PLACE_NOT_FOUND: 'BUSINESS_PLACE_NOT_FOUND',
  OUTSIDE_SERVICE_AREA: 'OUTSIDE_SERVICE_AREA',
  PROMOTION_LIMIT: 'PROMOTION_LIMIT', // vượt số khuyến mãi đang chạy của gói
  PROMOTION_NOT_FOUND: 'PROMOTION_NOT_FOUND',
  NOTIFY_NOT_ALLOWED: 'NOTIFY_NOT_ALLOWED', // gói không có / hết lượt báo cho khách tuần này / đã báo rồi
  REVIEW_NOT_FOUND: 'REVIEW_NOT_FOUND',
  PROMOTION_KIND_LOCKED: 'PROMOTION_KIND_LOCKED', // loại sự kiện chưa có trong gói
  VOUCHER_SOLD_OUT: 'VOUCHER_SOLD_OUT',
  VOUCHER_ALREADY_CLAIMED: 'VOUCHER_ALREADY_CLAIMED',
  VOUCHER_NOT_STARTED: 'VOUCHER_NOT_STARTED',
  VOUCHER_TOO_FAR: 'VOUCHER_TOO_FAR', // check-in: chưa tới quán
  VOUCHER_INVALID: 'VOUCHER_INVALID', // quán nhập mã sai / đã dùng / hết hạn
  VOUCHER_OWN_SHOP: 'VOUCHER_OWN_SHOP',
};
