import { APP_TIMEZONE_OFFSET_HOURS, LEADERBOARD_PERIODS } from '../constants/gamification.js';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = APP_TIMEZONE_OFFSET_HOURS * HOUR_MS;

// Mốc 00:00 theo giờ Việt Nam của ngày chứa `date`, trả về dạng Date (UTC).
export const startOfLocalDay = (date = new Date()) => {
  const local = new Date(date.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - OFFSET_MS);
};

// Số ngày lịch (giờ VN) giữa 2 thời điểm: cùng ngày = 0, hôm qua = 1.
export const localDayDiff = (from, to = new Date()) =>
  Math.round((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / DAY_MS);

// Thời điểm bắt đầu của kỳ xếp hạng: tuần bắt đầu thứ Hai, tháng bắt đầu ngày 1 (giờ VN).
export const getPeriodStart = (period, now = new Date()) => {
  if (period === LEADERBOARD_PERIODS.ALL) return null;

  const today = startOfLocalDay(now);
  const local = new Date(today.getTime() + OFFSET_MS);

  if (period === LEADERBOARD_PERIODS.WEEK) {
    const daysSinceMonday = (local.getUTCDay() + 6) % 7;
    return new Date(today.getTime() - daysSinceMonday * DAY_MS);
  }
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - OFFSET_MS);
};

// "2026-10-01" theo giờ Việt Nam — dùng làm khóa chống thưởng trùng trong ngày.
export const toLocalDateKey = (date = new Date()) =>
  new Date(startOfLocalDay(date).getTime() + OFFSET_MS).toISOString().slice(0, 10);
