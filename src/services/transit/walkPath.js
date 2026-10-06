// Đường đi bộ thật giữa 2 điểm (vẽ chặng đi bộ của phương án đang chọn): OSRM "foot" của FOSSGIS trên OpenStreetMap.
// Gọi lần lượt (giãn 250 ms), cache 7 ngày; dịch vụ lỗi => đường thẳng (giao diện vẫn vẽ được).
import { TRANSIT_PLANNER, TRANSIT_SOURCE, WALK_ROUTER } from '../../constants/transit.js';
import { metersBetween } from './transitGeometry.js';

const cache = new Map();
let queue = Promise.resolve();
let lastCallAt = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const keyOf = (from, to) => [...from, ...to].map((value) => Number(value).toFixed(5)).join(',');
const minutesFor = (meters) => Math.max(1, Math.round((meters / 1000 / TRANSIT_PLANNER.WALK_SPEED_KMH) * 60));

const requestFootRoute = async (from, to) => {
  await sleep(Math.max(0, lastCallAt + WALK_ROUTER.REQUEST_GAP_MS - Date.now()));
  lastCallAt = Date.now();
  const url = `${WALK_ROUTER.URL}/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`;
  const response = await fetch(url, { headers: { 'User-Agent': TRANSIT_SOURCE.USER_AGENT }, signal: AbortSignal.timeout(WALK_ROUTER.TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Đường đi bộ HTTP ${response.status}`);
  const route = (await response.json()).routes?.[0];
  if (!route?.geometry?.coordinates?.length) throw new Error('Không tìm được đường đi bộ');
  return { coordinates: [from, ...route.geometry.coordinates, to], distance_m: Math.round(route.distance) };
};

/** @returns {{ coordinates: [lng, lat][], distance_m, duration_min, source: 'osm' | 'straight', attribution }} */
export const getWalkPath = async (from, to) => {
  const key = keyOf(from, to);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < WALK_ROUTER.CACHE_TTL_MS) return cached.data;
  const task = queue.then(() => requestFootRoute(from, to));
  queue = task.catch(() => {});
  let data;
  try {
    const route = await task;
    data = { ...route, duration_min: minutesFor(route.distance_m), source: 'osm', attribution: WALK_ROUTER.ATTRIBUTION };
  } catch {
    const meters = Math.round(metersBetween(from, to) * TRANSIT_PLANNER.ROAD_DETOUR);
    return { coordinates: [from, to], distance_m: meters, duration_min: minutesFor(meters), source: 'straight', attribution: null }; // lỗi => không cache, lần sau thử lại
  }
  cache.delete(key);
  cache.set(key, { at: Date.now(), data });
  if (cache.size > WALK_ROUTER.CACHE_MAX) cache.delete(cache.keys().next().value);
  return data;
};
