// Dự báo thời tiết theo giờ từ Open-Meteo (miễn phí, không cần key; dữ liệu CC BY 4.0 => luôn ghi nguồn).
// Cache theo ô lưới ~1 km trong 1 giờ: nhiều người hỏi cùng khu chỉ tốn 1 lượt gọi (giới hạn 10.000 lượt/ngày).
import { EXTERNAL_TIMEOUT_MS, EXTERNAL_USER_AGENT, OPEN_METEO, WEATHER_CODES } from '../../constants/externalSources.js';
import { createMemoryCache } from '../../utils/memoryCache.js';

const cache = createMemoryCache(OPEN_METEO.CACHE_TTL_MS);
const TIMEZONE = 'Asia/Ho_Chi_Minh';

const fetchForecast = async (lat, lng) => {
  const url = `${OPEN_METEO.URL}?${new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    timezone: TIMEZONE,
    forecast_days: String(OPEN_METEO.FORECAST_DAYS),
  })}`;
  const response = await fetch(url, { headers: { 'User-Agent': EXTERNAL_USER_AGENT }, signal: AbortSignal.timeout(EXTERNAL_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`);
  return (await response.json()).hourly;
};

export const weatherSource = { label: OPEN_METEO.LABEL, url: OPEN_METEO.LINK, license: OPEN_METEO.LICENSE };

/**
 * @param {{ lat, lng, date: 'YYYY-MM-DD', hour: number }} input — giờ Việt Nam
 * @returns {Promise<{ time, temperature_c, rain_probability, description, rain_likely, source } | null>} null = ngoài 3 ngày tới / lỗi
 */
export const getWeatherAt = async ({ lat, lng, date, hour }) => {
  const gridLat = lat.toFixed(OPEN_METEO.GRID_DECIMALS);
  const gridLng = lng.toFixed(OPEN_METEO.GRID_DECIMALS);
  try {
    const hourly = await cache.wrap(`${gridLat},${gridLng}`, () => fetchForecast(gridLat, gridLng));
    const index = hourly.time.indexOf(`${date}T${String(hour).padStart(2, '0')}:00`);
    if (index < 0) return null;
    const rainProbability = hourly.precipitation_probability[index];
    return {
      time: hourly.time[index],
      temperature_c: Math.round(hourly.temperature_2m[index]),
      rain_probability: rainProbability,
      description: WEATHER_CODES[hourly.weather_code[index]] ?? 'Không rõ',
      rain_likely: rainProbability >= OPEN_METEO.RAIN_LIKELY_PERCENT,
      source: weatherSource,
    };
  } catch {
    return null;
  }
};
