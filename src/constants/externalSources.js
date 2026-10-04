// Nguồn thông tin miễn phí cho AI Planner khi người dùng hỏi về 1 địa điểm.
// Nguyên tắc: dữ liệu MapMate là chính; nguồn ngoài chỉ BỔ SUNG và luôn ghi rõ nguồn + link.

export const EXTERNAL_USER_AGENT = 'MapMate-HCMUT/1.0 (+https://github.com/MapMate-HCMUT)'; // Wikimedia yêu cầu định danh app
export const EXTERNAL_TIMEOUT_MS = 6000;

// Wikipedia tiếng Việt — CHỈ dùng cho bối cảnh / lịch sử của địa danh (bảo tàng, di tích, chợ, công viên...),
// KHÔNG dùng cho giờ mở cửa / giá vé (hay lỗi thời). Phải khớp toạ độ với địa điểm trong DB để tránh nhầm bài.
export const WIKIPEDIA = {
  API_URL: 'https://vi.wikipedia.org/w/api.php',
  SUMMARY_URL: 'https://vi.wikipedia.org/api/rest_v1/page/summary/',
  MAX_DISTANCE_M: 500,
  SEARCH_LIMIT: 3,
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 ngày
  EXTRACT_MAX_LENGTH: 600,
  LABEL: 'Theo Wikipedia',
  LICENSE: 'CC BY-SA 4.0',
};
export const WIKIPEDIA_KINDS = new Set(['museum', 'landmark', 'worship', 'market', 'park', 'zoo', 'theme_park', 'walking_street', 'theatre', 'attraction']);
export const WIKIPEDIA_CATEGORIES = new Set(['attraction', 'park']);

// Open-Meteo — miễn phí cho mục đích phi thương mại (< 10.000 lượt/ngày), dữ liệu CC BY 4.0 => phải ghi nguồn.
// Cache theo ô ~1 km + giờ => cả lớp cùng hỏi "tối nay mưa không" chỉ tốn 1 lượt gọi.
export const OPEN_METEO = {
  URL: 'https://api.open-meteo.com/v1/forecast',
  CACHE_TTL_MS: 60 * 60 * 1000,
  FORECAST_DAYS: 3,
  GRID_DECIMALS: 2,
  RAIN_LIKELY_PERCENT: 60,
  LABEL: 'Thời tiết: Open-Meteo.com',
  LINK: 'https://open-meteo.com/',
  LICENSE: 'CC BY 4.0',
};
// Mã thời tiết WMO -> mô tả tiếng Việt (open-meteo.com/en/docs)
export const WEATHER_CODES = {
  0: 'Trời quang', 1: 'Ít mây', 2: 'Có mây', 3: 'Nhiều mây', 45: 'Sương mù', 48: 'Sương mù',
  51: 'Mưa phùn nhẹ', 53: 'Mưa phùn', 55: 'Mưa phùn dày', 61: 'Mưa nhẹ', 63: 'Mưa vừa', 65: 'Mưa to',
  80: 'Mưa rào nhẹ', 81: 'Mưa rào', 82: 'Mưa rào rất to', 95: 'Dông', 96: 'Dông kèm mưa đá', 99: 'Dông kèm mưa đá',
};

export const PLACE_INFO_SOURCES = { MAPMATE: 'mapmate', WIKIPEDIA: 'wikipedia', OPEN_METEO: 'open_meteo', ESTIMATE: 'estimate' };
