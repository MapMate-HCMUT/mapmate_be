export const POST_TYPES = { PLACE: 'place', ITINERARY: 'itinerary', TEXT: 'text' };
export const POST_VISIBILITY = { PUBLIC: 'public', FRIENDS: 'friends' };
export const ITINERARY_VISIBILITY = { PRIVATE: 'private', FRIENDS: 'friends', PUBLIC: 'public' };
export const FEED_SCOPES = { PUBLIC: 'public', FRIENDS: 'friends', MINE: 'mine' };
export const FRIENDSHIP_STATUS = { PENDING: 'pending', ACCEPTED: 'accepted' };
export const PIN_STATUS = { VISITED: 'visited', WISHLIST: 'wishlist' };

// Trạng thái quan hệ giữa người xem và 1 người dùng khác
export const RELATIONSHIP = {
  SELF: 'self',
  NONE: 'none',
  FRIENDS: 'friends',
  PENDING_SENT: 'pending_sent', // tôi đã gửi lời mời
  PENDING_RECEIVED: 'pending_received', // họ gửi lời mời cho tôi
};

export const POST_CONTENT_MAX_LENGTH = 1000;
export const POST_MAX_TAGS = 8;
export const POST_TAG_MAX_LENGTH = 30;
export const POST_MAX_TAGGED_USERS = 10;

// Ảnh / video đính kèm bài viết — lưu ở Cloudinary, trình duyệt tải thẳng lên (không đi qua server MapMate)
export const POST_MEDIA = {
  MAX_ITEMS: 6, // tối đa 6 ảnh / video mỗi bài
  MAX_VIDEOS: 1,
  // Mọi video MapMate nằm chung 1 thư mục, mọi ảnh chung 1 thư mục (Cloudinary → Media Library).
  // Tên file = <id người đăng>_<mã ngẫu nhiên> => vẫn biết file của ai mà không cần thư mục riêng cho từng người.
  FOLDERS: { image: 'mapmate/images', video: 'mapmate/videos' },
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  VIDEO_MAX_BYTES: 100 * 1024 * 1024, // = mức tối đa 1 video của gói Cloudinary miễn phí
  VIDEO_MAX_SECONDS: 90,
  FORMATS: { image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'], video: ['mp4', 'mov', 'webm', 'm4v'] },
  REQUEST_TIMEOUT_MS: 10000,
  // Mỗi người / ngày (theo giờ VN) — chặn 1 tài khoản đốt hết hạn mức Cloudinary của cả app
  DAILY_FILES: 30, // ~5 bài có 6 ảnh
  DAILY_VIDEOS: 5,
  DAILY_BYTES: 500 * 1024 * 1024, // tổng dung lượng file đã đăng trong ngày
  // File đã tải lên nhưng không đăng bài (đóng khung, bỏ dở) => tự xoá sau 6 giờ
  ORPHAN_TTL_MS: 6 * 60 * 60 * 1000,
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  CLEANUP_FIRST_DELAY_MS: 60 * 1000, // lần dọn đầu tiên: 1 phút sau khi server chạy
  CLEANUP_BATCH: 100,
};

// Cầu dao hạn mức Cloudinary của CẢ app (gói miễn phí 25 credit / tháng — xem /usage của Cloudinary)
export const MEDIA_USAGE_GUARD = {
  CHECK_TTL_MS: 15 * 60 * 1000, // hỏi Cloudinary tối đa 15 phút / lần
  VIDEO_OFF_PERCENT: 80, // dùng ≥ 80% => tạm ngưng đăng video (video tốn hạn mức nhất)
  ALL_OFF_PERCENT: 90, // dùng ≥ 90% => tạm ngưng mọi ảnh / video, để dành phần còn lại cho ảnh đã đăng hiển thị
};
export const MEDIA_UPLOAD_STATUS = { PENDING: 'pending', ATTACHED: 'attached', DELETED: 'deleted' };
export const MEDIA_TYPES = ['image', 'video'];
export const SHARE_MAX_RECIPIENTS = 20;
export const SHARE_MESSAGE_MAX_LENGTH = 200;
export const PIN_NOTE_MAX_LENGTH = 300;

export const FEED_DEFAULT_LIMIT = 10;
export const FEED_MAX_LIMIT = 30;
export const TRENDING_TAGS_LIMIT = 10;
export const TRENDING_TAGS_WINDOW_DAYS = 14;
export const TRENDING_TAGS_CACHE_TTL_MS = 5 * 60 * 1000;

export const MAX_PENDING_FRIEND_REQUESTS = 50;
export const USER_SEARCH_LIMIT = 10;
export const FRIEND_SUGGESTION_LIMIT = 6;

export const ITINERARY_NAME_MAX_LENGTH = 80;
export const ITINERARY_MAX_STOPS = 8;
export const ITINERARY_LIST_LIMIT = 30;

// Giới hạn thao tác ghi (đăng bài, kết bạn...) để chống spam
export const SOCIAL_WRITE_RATE_LIMIT = { WINDOW_MS: 10 * 60 * 1000, MAX_REQUESTS: 60 };
