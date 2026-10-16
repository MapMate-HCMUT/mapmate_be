// Proxy Goong REST (tìm địa chỉ, toạ độ -> địa chỉ, chỉ đường): key Goong CHỈ ở server (trước đây nằm trong bundle frontend
// => ai mở DevTools cũng lấy được và dùng hết hạn mức). Trả nguyên phần dữ liệu Goong cần (results / routes) để giao diện
// giữ cách đọc cũ. Cache ngắn theo đúng câu hỏi => bấm lại / nhiều người hỏi cùng chỗ không tốn thêm lượt Goong.
import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

const GOONG_BASE = 'https://rsapi.goong.io';
const TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();

const unavailable = () => new AppError('Chưa tìm được địa chỉ / đường đi, bạn thử lại sau nhé', HTTP_STATUS.BAD_GATEWAY, ERROR_CODES.GEO_UNAVAILABLE);

const callGoong = async (path, params) => {
  if (!env.goong.apiKey) throw unavailable();
  const query = new URLSearchParams({ ...params, api_key: env.goong.apiKey });
  const cacheKey = `${path}?${new URLSearchParams(params)}`; // không đưa key vào khoá cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  let response;
  try {
    response = await fetch(`${GOONG_BASE}${path}?${query}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw unavailable();
  }
  if (!response.ok) throw unavailable(); // không trả nguyên lỗi Goong (có thể lộ thông tin key / hạn mức) cho trình duyệt
  const data = await response.json();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, { data, at: Date.now() });
  return data;
};

/** Địa chỉ / tên nơi chốn -> toạ độ (giới hạn TP.HCM) */
export const geocode = async (address) => ({ results: (await callGoong('/geocode', { address: `${address}, Hồ Chí Minh` })).results ?? [] });

/** Toạ độ -> địa chỉ */
export const reverseGeocode = async ({ lat, lng }) => ({ results: (await callGoong('/Geocode', { latlng: `${lat},${lng}` })).results ?? [] });

/** Chỉ đường 2 điểm theo phương tiện Goong (bike / car / taxi / truck / hd) */
export const direction = async ({ origin, destination, vehicle }) => ({
  routes: (await callGoong('/Direction', { origin: `${origin.lat},${origin.lng}`, destination: `${destination.lat},${destination.lng}`, vehicle })).routes ?? [],
});
