// Giao thông công cộng TP.HCM: xe buýt, Metro số 1, buýt đường sông — dữ liệu CÔNG KHAI của Trung tâm Quản lý Giao thông
// công cộng (API mà trang buyttphcm.com.vn dùng: tuyến, trạm, lộ trình, giờ xuất bến, dự đoán xe tới trạm).
// Nhập định kỳ (npm run transit:import), gọi nhẹ nhàng, luôn ghi nguồn.

export const TRANSIT_SOURCE = {
  BASE_URL: 'https://apicms.ebms.vn',
  REFERER: 'https://buyttphcm.com.vn/',
  USER_AGENT: 'Mozilla/5.0 (compatible; MapMate-HCMUT/1.0; student project)',
  TIMEOUT_MS: 20000,
  REQUEST_GAP_MS: 400, // nhập dữ liệu: ~2 request / giây
  CACHE_DIR: 'data/transit/cache', // lưu phản hồi thô khi nhập => chạy lại không phải tải lại (giữ 7 ngày)
  CACHE_TTL_DAYS: 7,
  ATTRIBUTION: 'Dữ liệu xe buýt & metro: Trung tâm Quản lý Giao thông công cộng TP.HCM — buyttphcm.com.vn',
};

export const TRANSIT_MODES = { BUS: 'bus', METRO: 'metro', WATERBUS: 'waterbus' };
export const TRANSIT_MODE_VALUES = Object.values(TRANSIT_MODES);
// Đang dùng: xe buýt + metro. Buýt đường sông tạm chưa dùng (vẫn nhập dữ liệu, không vẽ / không gợi ý)
export const ENABLED_TRANSIT_MODES = [TRANSIT_MODES.BUS, TRANSIT_MODES.METRO];
// Số tuyến: "MRT1" = metro, "SWB1" = buýt đường sông; tuyến đưa rước học sinh ("HS-..") không mở cho khách => không gợi ý
export const modeOfRouteNo = (routeNo = '') => (/^MRT/i.test(routeNo) ? TRANSIT_MODES.METRO : /^SWB/i.test(routeNo) ? TRANSIT_MODES.WATERBUS : TRANSIT_MODES.BUS);
export const isPublicRoute = (routeNo = '', type = '') => !/^HS-/i.test(routeNo) && !/học sinh/i.test(type);

// Bộ tìm đường đi bằng phương tiện công cộng (đi thẳng hoặc 1 lần chuyển tuyến)
export const TRANSIT_PLANNER = {
  ROAD_DETOUR: 1.3, // đường thật dài hơn đường chim bay ~30%
  WALK_SPEED_KMH: 4.5,
  WALK_ONLY_MAX_M: 2500, // xa hơn thì không gợi ý đi bộ cả chặng
  MAX_WALK_ACCESS_M: { DEFAULT: 800, MIN: 200, MAX: 2000 }, // đi bộ ra / rời trạm
  MAX_RIDE_ACCESS_M: 5000, // gọi xe ra trạm (Grab / Be...) tối đa 5 km
  RIDE_SHORT_WALK_M: 300, // dưới 300 m thì đi bộ, không gọi xe
  MAX_RIDE_SHARE: 0.6, // gọi xe quá 60% quãng đường => thà gọi xe đi thẳng
  RIDE: { mode: 'grab_bike', speedKmh: 25, waitMinutes: 4 }, // gọi xe máy công nghệ
  NEAREST_STOPS: 30, // số trạm gần nhất xét ở mỗi đầu
  TRANSFER_WALK_M: 300, // đổi tuyến: đi bộ tối đa 300 m sang trạm khác
  TRANSFER_PENALTY_MIN: 5, // mỗi lần đổi tuyến "tốn" thêm 5 phút khi so sánh (bất tiện)
  BOARDING_PENALTY_MIN: 3, // mỗi lần lên xe "tốn" 3 phút khi so sánh => đi 1 trạm không thắng đi bộ chỉ nhờ nhanh hơn 1–2 phút
  STATION_MINUTES: { metro: 3, waterbus: 3, bus: 0 }, // vào / ra ga
  DEFAULT_HEADWAY_MIN: 15,
  MAX_TRANSIT_OPTIONS: 5,
  GROUP_MAX_EXTRA_WAIT_MIN: 20, // gộp tuyến cùng trạm: chỉ tuyến có xe tới ≤ 20 phút sau xe chính
  MAX_SLOWDOWN_FACTOR: 2, // phương án chậm hơn gấp đôi...
  MAX_SLOWDOWN_MIN: 20, // ...và hơn 20 phút so với phương án nhanh nhất => bỏ
  SEARCH_HORIZON_MIN: 120, // không chờ chuyến quá 2 giờ
  NETWORK_RELOAD_MS: 5 * 60 * 1000, // kiểm tra dữ liệu mới nhập
  // Trọng số so sánh phương án theo ưu tiên của người dùng (phút "quy đổi")
  PRIORITIES: {
    fastest: { walk: 0.3, cost: 0.1 }, // nhanh nhất: chủ yếu theo thời gian
    least_walk: { walk: 2.5, cost: 0.1 }, // ít đi bộ
    cheapest: { walk: 0.3, cost: 1.0 }, // rẻ nhất: 1.000đ ≈ 1 phút
  },
  VND_PER_COST_UNIT: 1000,
};
export const TRANSIT_PRIORITY_VALUES = Object.keys(TRANSIT_PLANNER.PRIORITIES);
// Cách ra / rời trạm: đi bộ (không gọi xe), gọi xe (Grab / Be...), tự động (gần đi bộ, xa gọi xe)
export const TRANSIT_CONNECTORS = ['auto', 'walk', 'ride'];

// Đường đi bộ thật (Goong không có chế độ đi bộ; mượn đường xe máy bị vòng theo đường một chiều):
// bộ tìm đường đi bộ OSRM của FOSSGIS trên dữ liệu OpenStreetMap — miễn phí, dùng nhẹ (chỉ phương án đang chọn, có cache)
export const WALK_ROUTER = {
  URL: 'https://routing.openstreetmap.de/routed-foot/route/v1/foot',
  TIMEOUT_MS: 8000,
  REQUEST_GAP_MS: 250,
  CACHE_MAX: 2000,
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  MAX_DISTANCE_M: 6000,
  ATTRIBUTION: 'Đường đi bộ: © OpenStreetMap contributors · routing.openstreetmap.de',
};

export const TRANSIT_REALTIME = { CACHE_MS: 20000, MAX_ARRIVALS_PER_ROUTE: 3 };
export const TRANSIT_BBOX_MAX_STOPS = 1500;
