export const BCRYPT_ROUNDS = 10; // NFR-04
export const JWT_DEFAULT_EXPIRES_IN = '7d'; // Milestone 2 — mục 3.6

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72; // bcrypt chỉ dùng 72 byte đầu
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_DB_MAX_LENGTH = 30; // giới hạn ở schema, rộng hơn để tài khoản cũ vẫn lưu được
export const USERNAME_CHANGE_COOLDOWN_DAYS = 14;

// Không cho đặt các tên dễ gây nhầm là tài khoản hệ thống / đường dẫn của app.
export const RESERVED_USERNAMES = [
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'mod', 'moderator', 'staff',
  'mapmate', 'official', 'api', 'login', 'logout', 'register', 'profile', 'users', 'me',
  'settings', 'null', 'undefined', 'anonymous', 'guest',
];

export const AUTH_RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000,
  MAX_REQUESTS: 20,
};

export const AVATAR_URL_MAX_LENGTH = 500;

export const MIN_USER_AGE = 13;
export const MAX_USER_AGE = 120;
export const HOME_AREA_FIELD_MAX_LENGTH = 100;

export const AVATAR_MAX_BYTES = 256 * 1024;
export const AVATAR_BODY_LIMIT = '400kb'; // base64 làm dữ liệu to thêm ~33%
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
