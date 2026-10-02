// Luật trò chơi hóa MapMate (Milestone 1 — mục 3.5, Milestone 2 — mục 4.3).

// Các hành động được thưởng. Mỗi hành động ghi 1 dòng vào sổ XP (xp_transactions).
export const XP_ACTIONS = {
  CHECK_IN: 'check_in',
  FLOOD_REPORT: 'flood_report',
  ROAD_REPORT: 'road_report',
  REPORT_VERIFIED: 'report_verified',
  TRIP_COMPLETED: 'trip_completed',
  DAILY_STREAK: 'daily_streak',
  BADGE_UNLOCKED: 'badge_unlocked',
};

export const XP_REWARDS = {
  [XP_ACTIONS.CHECK_IN]: { xp: 50, stars: 10 }, // AC-5.2: check-in +50 XP
  [XP_ACTIONS.FLOOD_REPORT]: { xp: 50, stars: 10 }, // POST /api/reports: +50 XP
  [XP_ACTIONS.ROAD_REPORT]: { xp: 30, stars: 5 },
  [XP_ACTIONS.REPORT_VERIFIED]: { xp: 10, stars: 2 },
  [XP_ACTIONS.TRIP_COMPLETED]: { xp: 100, stars: 20 },
  [XP_ACTIONS.DAILY_STREAK]: { xp: 5, stars: 1 },
};

// Bộ đếm hoạt động lưu sẵn trong users.stats — đọc O(1), không cần đếm lại sổ XP.
export const ACTION_STAT_FIELD = {
  [XP_ACTIONS.CHECK_IN]: 'checkins',
  [XP_ACTIONS.FLOOD_REPORT]: 'flood_reports',
  [XP_ACTIONS.ROAD_REPORT]: 'road_reports',
  [XP_ACTIONS.TRIP_COMPLETED]: 'trips_completed',
};

// Level 1-5 (Milestone 1 — mục 2). minXp tăng dần.
export const LEVELS = [
  { level: 1, title: 'Người mới', minXp: 0 },
  { level: 2, title: 'Người đi đường', minXp: 200 },
  { level: 3, title: 'Thổ địa', minXp: 500 },
  { level: 4, title: 'Nhà thám hiểm', minXp: 1000 },
  { level: 5, title: 'Huyền thoại Sài Gòn', minXp: 2000 },
];

// Huy hiệu tự động: điều kiện đọc từ users.stats / streak_days.
export const BADGES = [
  { code: 'pioneer', name: 'Tiên phong', icon: '🏅', xpReward: 20, description: 'Hoàn thành hoạt động đầu tiên', stat: 'total_actions', threshold: 1 },
  { code: 'checkin_master', name: 'Check-in Master', icon: '📸', xpReward: 100, description: 'Check-in 10 địa điểm', stat: 'checkins', threshold: 10 },
  { code: 'flood_fighter', name: 'Dũng sĩ né ngập', icon: '🌊', xpReward: 100, description: 'Báo cáo 5 điểm ngập', stat: 'flood_reports', threshold: 5 },
  { code: 'traffic_hero', name: 'Cứu tinh giao thông', icon: '🦸', xpReward: 80, description: 'Gửi 10 báo cáo tình trạng đường', stat: 'road_reports', threshold: 10 },
  { code: 'explorer', name: 'Explorer', icon: '🗺️', xpReward: 150, description: 'Hoàn thành 10 chuyến đi khám phá', stat: 'trips_completed', threshold: 10 },
  { code: 'streak_7', name: 'Chuỗi 7 ngày', icon: '🔥', xpReward: 50, description: 'Mở app khám phá 7 ngày liên tiếp', stat: 'streak_days', threshold: 7 },
];

export const LEADERBOARD_PERIODS = { WEEK: 'week', MONTH: 'month', ALL: 'all' };
export const LEADERBOARD_DEFAULT_LIMIT = 20;
export const LEADERBOARD_MAX_LIMIT = 100;
export const LEADERBOARD_CACHE_TTL_MS = 10 * 60 * 1000; // Milestone 2: cache 10 phút

export const APP_TIMEZONE_OFFSET_HOURS = 7; // Asia/Ho_Chi_Minh (UTC+7, không có DST)

export const XP_HISTORY_DEFAULT_LIMIT = 15;
export const XP_HISTORY_MAX_LIMIT = 50;
