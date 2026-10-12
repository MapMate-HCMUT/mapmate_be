// Giờ mở cửa theo từng ngày trong tuần (chủ quán tự nhập). Dạng: { mon: [{ open: '07:00', close: '22:00' }], ..., sun: [] }
// - Mảng rỗng = nghỉ ngày đó; nhiều khung = nghỉ trưa (07:00–11:00, 17:00–22:00); tối đa 3 khung / ngày
// - close < open = mở qua đêm (18:00–02:00 tính cho ngày bắt đầu); close = '24:00' + open = '00:00' = mở 24 giờ
// Địa điểm từ dữ liệu mở chỉ có opening_hours (1 khung chung) => các hàm ở đây trả về giống hệt cách cũ.
import { APP_TIMEZONE_OFFSET_HOURS } from '../constants/gamification.js';
import { isOpenAt } from './geo.js';

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const DAY_LABELS = { mon: 'Thứ 2', tue: 'Thứ 3', wed: 'Thứ 4', thu: 'Thứ 5', fri: 'Thứ 6', sat: 'Thứ 7', sun: 'Chủ nhật' };
const HOUR_MS = 60 * 60 * 1000;

/** Ngày trong tuần + giờ "HH:mm" theo giờ Việt Nam */
export const localDayAndTime = (date = new Date()) => {
  const local = new Date(date.getTime() + APP_TIMEZONE_OFFSET_HOURS * HOUR_MS);
  return { day: DAY_KEYS[(local.getUTCDay() + 6) % 7], time: local.toISOString().slice(11, 16) };
};
const previousDay = (day) => DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7];
const isOvernight = (range) => range.close < range.open;

/** Các khung giờ của 1 ngày; null = không có lịch theo ngày (dùng opening_hours như cũ) */
export const rangesForDay = (place, day) => (place.weekly_hours ? place.weekly_hours[day] ?? [] : null);

/**
 * Có mở lúc `time` của ngày `day` không — tính cả phần sau nửa đêm của khung qua đêm hôm trước.
 * Không có lịch theo ngày => isOpenAt(opening_hours) như cũ.
 */
export const isOpenOnDay = (place, day, time, fallbackHours = place.opening_hours) => {
  const today = rangesForDay(place, day);
  if (!today) return isOpenAt(fallbackHours, time);
  if (today.some((range) => (isOvernight(range) ? time >= range.open : range.open <= time && time < range.close))) return true;
  return (place.weekly_hours[previousDay(day)] ?? []).some((range) => isOvernight(range) && time < range.close);
};

/**
 * 1 khung "đại diện" cho cả tuần (khung xuất hiện nhiều nhất trong các ngày mở) — ghi vào opening_hours để bộ lọc
 * "đang mở lúc..." và các chỗ chỉ biết 1 khung giờ vẫn chạy. null = nghỉ cả tuần.
 */
export const summarizeWeek = (weekly) => {
  const counts = new Map();
  for (const day of DAY_KEYS) {
    const ranges = weekly[day] ?? [];
    if (!ranges.length) continue;
    // nhiều khung trong ngày => lấy từ giờ mở sớm nhất tới giờ đóng muộn nhất
    const span = { open: ranges[0].open, close: ranges.at(-1).close === '24:00' ? '23:59' : ranges.at(-1).close };
    const key = `${span.open}-${span.close}`;
    counts.set(key, { span, count: (counts.get(key)?.count ?? 0) + 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.span ?? null;
};

const formatRanges = (ranges) => ranges.map((range) => (range.open === '00:00' && range.close === '24:00' ? 'mở 24 giờ' : `${range.open}–${range.close}`)).join(', ');

/** "07:00–22:00" / "nghỉ hôm nay" / "mở 24 giờ" — cho AI và thẻ địa điểm */
export const describeToday = (place, date = new Date()) => {
  const { day } = localDayAndTime(date);
  const ranges = rangesForDay(place, day);
  if (!ranges) return place.opening_hours?.open ? `${place.opening_hours.open}–${place.opening_hours.close}` : null;
  return ranges.length ? formatRanges(ranges) : 'nghỉ hôm nay';
};

/** Dữ liệu giờ mở cửa trả về cho giao diện */
export const hoursView = (place, date = new Date()) => {
  if (!place.weekly_hours) return { weekly_hours: null, today_hours: null, closed_today: false };
  const { day } = localDayAndTime(date);
  const today = place.weekly_hours[day] ?? [];
  return { weekly_hours: Object.fromEntries(DAY_KEYS.map((key) => [key, place.weekly_hours[key] ?? []])), today_hours: today, closed_today: today.length === 0 };
};
