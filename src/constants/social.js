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
