// Đọc giờ mở cửa kiểu OpenStreetMap -> { open, close } "HH:mm" của MapMate (1 khung / ngày).
// "24/7"                                  -> mở cả ngày
// "Mo-Su 07:00-22:00" / "10:00-22:00"     -> 07:00–22:00
// "Mo-Fr 10:00-22:00; Sa-Su 09:00-23:00"  -> 09:00–23:00 (gộp: mở sớm nhất, đóng muộn nhất trong tuần — gần đúng)
// "11:00-14:00,17:00-22:00"               -> 11:00–22:00 (gộp ca trưa + tối — gần đúng)
// Không đọc được -> null (= chưa rõ giờ)
const ALWAYS_OPEN = /^\s*24\/7\s*$/;
const TIME_RANGE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/g;
const MINUTES_PER_HOUR = 60;
const LATE_NIGHT_HOUR = 6; // đóng lúc 00:00–06:00 = mở qua đêm

const toMinutes = (hours, minutes) => Number(hours) * MINUTES_PER_HOUR + Number(minutes);
const toTime = (total) => {
  const minutes = total % (24 * MINUTES_PER_HOUR);
  return `${String(Math.floor(minutes / MINUTES_PER_HOUR)).padStart(2, '0')}:${String(minutes % MINUTES_PER_HOUR).padStart(2, '0')}`;
};

export const parseOsmOpeningHours = (value) => {
  if (!value) return null;
  if (ALWAYS_OPEN.test(value)) return { open: null, close: null, alwaysOpen: true };

  const ranges = [...value.matchAll(TIME_RANGE)].map(([, h1, m1, h2, m2]) => {
    const open = toMinutes(h1, m1);
    let close = toMinutes(h2, m2);
    if (close <= open || Number(h2) < LATE_NIGHT_HOUR) close += 24 * MINUTES_PER_HOUR; // qua nửa đêm
    return { open, close };
  });
  if (ranges.length === 0) return null;

  const open = Math.min(...ranges.map((range) => range.open));
  const close = Math.max(...ranges.map((range) => range.close));
  if (close - open >= 24 * MINUTES_PER_HOUR) return { open: null, close: null, alwaysOpen: true };
  return { open: toTime(open), close: toTime(close), alwaysOpen: false };
};

// Mở tới khuya (≥ 23:00) hoặc qua đêm => phong cách "Về đêm"
const LATE_CLOSE = '23:00';
export const isLateNight = (hours) =>
  Boolean(hours) && (hours.alwaysOpen || hours.close >= LATE_CLOSE || hours.close < hours.open);
