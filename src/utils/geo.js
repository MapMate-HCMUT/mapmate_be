const EARTH_RADIUS_KM = 6371;
const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

const toRad = (deg) => (deg * Math.PI) / 180;
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// Khoảng cách đường chim bay giữa 2 điểm [lng, lat] (km).
export const haversineKm = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
};

// "18:00" + 95 phút -> "19:35" (quay vòng qua nửa đêm)
export const addMinutesToTime = (time, minutes) => {
  const [hours, mins] = time.split(':').map(Number);
  const total = (((hours * MINUTES_PER_HOUR + mins + minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(total / MINUTES_PER_HOUR)).padStart(2, '0')}:${String(total % MINUTES_PER_HOUR).padStart(2, '0')}`;
};

export const roundTo = round;

// Địa điểm có mở cửa lúc `time` ("HH:mm") không? Không có giờ = mở cả ngày; close < open = mở qua đêm.
export const isOpenAt = (openingHours, time) => {
  const { open, close } = openingHours ?? {};
  if (!open || !close) return true;
  return open <= close ? open <= time && time < close : time >= open || time < close;
};
