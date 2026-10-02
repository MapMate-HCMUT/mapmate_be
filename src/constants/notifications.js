export const NOTIFICATION_TYPES = {
  WELCOME: 'welcome',
  BADGE_UNLOCKED: 'badge_unlocked',
  LEVEL_UP: 'level_up',
  SECURITY: 'security',
  SYSTEM: 'system',
  FRIEND_REQUEST: 'friend_request',
  FRIEND_ACCEPTED: 'friend_accepted',
  POST_TAGGED: 'post_tagged',
  POST_REPOSTED: 'post_reposted',
  POST_SHARED: 'post_shared',
};

export const NOTIFICATION_TTL_DAYS = 90; // tự xoá thông báo cũ hơn 90 ngày
export const NOTIFICATION_DEFAULT_LIMIT = 15;
export const NOTIFICATION_MAX_LIMIT = 50;
