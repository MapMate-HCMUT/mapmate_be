// Nhập địa điểm từ nguồn dữ liệu mở (Overture Maps + OpenStreetMap) — dùng bởi src/scripts/openData/*.
// Cả 2 nguồn đều có giấy phép cho phép LƯU vào database (khác Google Places), chỉ cần ghi nguồn.

// Nguồn gốc của 1 địa điểm (Place.source)
export const PLACE_SOURCES = {
  MAPMATE: 'mapmate', // nhóm MapMate tự nhập, đã kiểm tra (seed:places)
  OVERTURE: 'overture',
  OSM: 'osm',
  COMMUNITY: 'community', // người dùng đóng góp (sau này)
};
export const PLACE_SOURCE_VALUES = Object.values(PLACE_SOURCES);
export const OPEN_DATA_SOURCES = [PLACE_SOURCES.OVERTURE, PLACE_SOURCES.OSM];

// Dòng ghi nguồn bắt buộc khi hiển thị (ODbL yêu cầu ghi "© OpenStreetMap contributors").
export const OPEN_DATA_ATTRIBUTION = {
  [PLACE_SOURCES.OVERTURE]: { label: 'Overture Maps Foundation', license: 'CDLA-Permissive-2.0', url: 'https://overturemaps.org' },
  [PLACE_SOURCES.OSM]: { label: '© OpenStreetMap contributors', license: 'ODbL', url: 'https://www.openstreetmap.org/copyright' },
};

// Khung toạ độ TP.HCM (nội thành + Thủ Đức + Q7/Nhà Bè gần) — đủ cho bán kính tối đa 20 km quanh trung tâm.
export const OPEN_DATA_BBOX = { west: 106.58, south: 10.68, east: 106.86, north: 10.9 };

export const OPEN_DATA_FILES = {
  overture: 'data/open/overture_hcmc.geojsonseq',
  osm: 'data/open/osm_hcmc.json',
};

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
export const OVERPASS_TIMEOUT_SECONDS = 180;

// Overture chấm độ tin cậy 0–1 cho mỗi địa điểm (còn hoạt động, đúng vị trí). Dưới ngưỡng này bỏ qua.
export const DEFAULT_MIN_CONFIDENCE = 0.75;
// Địa điểm do OSM (con người vẽ tay) không có confidence => coi như mức này.
export const OSM_CONFIDENCE = 0.8;

// 2 bản ghi tên gần giống + cùng loại, cách nhau ≤ 80 m coi là 1 địa điểm; tên giống hệt thì cho lệch tới 150 m.
export const DUPLICATE_RADIUS_M = 80;
export const SAME_NAME_RADIUS_M = 150;
// Toạ độ dữ liệu nhóm tự nhập có thể lệch vài trăm mét => trùng y hệt tên với địa điểm MapMate trong 500 m là 1 nơi.
export const CURATED_SAME_NAME_RADIUS_M = 500;
// Gán quận cho địa điểm thiếu địa chỉ: lấy quận phổ biến nhất trong 7 địa điểm gần nhất (≤ 1.5 km) đã biết quận.
export const DISTRICT_NEIGHBORS = 7;
export const DISTRICT_MAX_DISTANCE_M = 1500;

export const IMPORT_BATCH_SIZE = 1000;
