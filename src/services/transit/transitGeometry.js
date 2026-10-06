// Hình học lộ trình tuyến (hàm thuần — có test): chiếu trạm lên đường đi để biết trạm nằm ở mét thứ bao nhiêu,
// cắt đoạn đường giữa 2 trạm để vẽ, khoảng cách đi bộ ước tính.
const EARTH_RADIUS_M = 6371000;
const toRad = (degrees) => (degrees * Math.PI) / 180;

export const metersBetween = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

export const cumulativeMeters = (line) => {
  const result = [0];
  for (let i = 1; i < line.length; i += 1) result.push(result[i - 1] + metersBetween(line[i - 1], line[i]));
  return result;
};

// Chiếu điểm lên đoạn AB (xấp xỉ phẳng — đoạn ngắn trong nội đô) => { t: 0..1, distance (m) }
const projectOnSegment = (point, a, b) => {
  const scale = Math.cos(toRad(point[1]));
  const ax = a[0] * scale;
  const bx = b[0] * scale;
  const px = point[0] * scale;
  const dx = bx - ax;
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (point[1] - a[1]) * dy) / length2)) : 0;
  const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { t, distance: metersBetween(point, projected) };
};

const NEAR_ENOUGH_M = 40; // đã thấy đoạn sát trạm (≤ 40 m)...
const MOVED_AWAY_M = 300; // ...và đường đã đi xa hơn 300 m => dừng tìm (tuyến vòng có thể quay lại cùng con đường sau đó)

/**
 * Trạm theo thứ tự -> vị trí trên lộ trình. Tìm tiến dần (trạm sau không nằm trước trạm trước).
 * @returns {{ offsets: number[], indices: number[] }} offsets = mét tính từ đầu lộ trình; indices = đoạn path[i]→path[i+1] chứa trạm
 */
export const projectStopsOnPath = (path, stops) => {
  const cumulative = cumulativeMeters(path);
  const offsets = [];
  const indices = [];
  let from = 0;
  for (const stop of stops) {
    let best = { index: from, t: 0, distance: Infinity };
    for (let i = from; i < path.length - 1; i += 1) {
      const projection = projectOnSegment(stop, path[i], path[i + 1]);
      if (projection.distance < best.distance) best = { index: i, ...projection };
      else if (best.distance <= NEAR_ENOUGH_M && projection.distance > best.distance + MOVED_AWAY_M) break;
    }
    if (path.length < 2) best = { index: 0, t: 0, distance: 0 };
    const segmentLength = (cumulative[best.index + 1] ?? cumulative[best.index]) - cumulative[best.index];
    offsets.push(Math.round(cumulative[best.index] + segmentLength * best.t));
    indices.push(best.index);
    from = best.index;
  }
  return { offsets, indices };
};

/** Đoạn đường giữa 2 trạm (để vẽ): trạm lên -> các điểm lộ trình ở giữa -> trạm xuống */
export const slicePath = (path, fromIndex, toIndex, fromPoint, toPoint) => [fromPoint, ...path.slice(fromIndex + 1, toIndex + 1), toPoint];

/** "6 - 14" -> 10 (phút, trung bình); "15" -> 15; không đọc được -> null */
export const parseHeadway = (text) => {
  const numbers = String(text ?? '').match(/\d+(?:[.,]\d+)?/g)?.map((value) => Number(value.replace(',', '.'))) ?? [];
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
};

/** "05:00 - 21:00" -> [300, 1260] (phút trong ngày) */
export const parseOperationTime = (text) => {
  const times = String(text ?? '').match(/\d{1,2}:\d{2}/g) ?? [];
  if (times.length < 2) return null;
  const [start, end] = times.map(timeToMinutes);
  return [start, end < start ? end + 24 * 60 : end];
};

export const timeToMinutes = (time) => {
  const [hours, minutes] = String(time).split(':').map(Number);
  return hours * 60 + minutes;
};
export const minutesToTime = (value) => {
  const minutes = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
