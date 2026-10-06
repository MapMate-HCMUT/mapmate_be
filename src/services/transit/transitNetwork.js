// Mạng lưới giao thông công cộng trong bộ nhớ (nạp từ MongoDB): trạm + "pattern" (mỗi lượt của 1 tuyến = 1 dãy trạm có thứ tự).
// Lưới ô ~550 m để tìm trạm gần nhanh. Nhập dữ liệu mới (npm run transit:import) => tự nạp lại sau tối đa 5 phút.
import { ENABLED_TRANSIT_MODES, TRANSIT_PLANNER } from '../../constants/transit.js';
import TransitRoute from '../../models/TransitRoute.model.js';
import TransitStop from '../../models/TransitStop.model.js';
import { metersBetween, parseHeadway, parseOperationTime, timeToMinutes } from './transitGeometry.js';

const CELL_DEGREES = 0.005;
const cellKey = (x, y) => `${x}:${y}`;
const cellOf = ([lng, lat]) => [Math.floor(lng / CELL_DEGREES), Math.floor(lat / CELL_DEGREES)];

/** Dựng mạng lưới từ dữ liệu tuyến / trạm (hàm thuần — test dùng dữ liệu giả) */
export const buildNetwork = (routes, stops, version = null) => {
  const stopMap = new Map(
    stops.map((stop) => [stop.stop_id, { id: stop.stop_id, name: stop.name, code: stop.code ?? null, coord: stop.location.coordinates, street: stop.street ?? null, zone: stop.zone ?? null }]),
  );
  const patterns = [];
  const stopPatterns = new Map();
  for (const route of routes) {
    for (const variant of route.variants ?? []) {
      const stopIds = variant.stop_ids.filter((id) => stopMap.has(id));
      if (stopIds.length < 2 || stopIds.length !== variant.stop_ids.length) continue; // thiếu trạm => bỏ lượt này
      const pattern = {
        idx: patterns.length,
        routeId: route.route_id,
        number: route.number,
        name: route.name,
        mode: route.mode,
        color: route.color ?? null,
        type: route.type ?? null,
        tickets: route.tickets ?? [],
        varId: variant.var_id,
        headsign: variant.short_name || variant.end_stop || route.name,
        stopIds,
        offsets: variant.stop_offsets_m,
        pathIndex: variant.stop_path_index,
        path: variant.path,
        distance: variant.distance_m || variant.stop_offsets_m.at(-1) || 1,
        runningMin: variant.running_min || null,
        headwayMin: parseHeadway(route.headway_text),
        operation: parseOperationTime(route.operation_time),
        timetables: (variant.timetables ?? [])
          .filter((tt) => tt.departures?.length)
          .map((tt) => ({ days: new Set(tt.apply_days ?? []), departures: tt.departures.map(timeToMinutes).sort((a, b) => a - b), headwayMin: parseHeadway(tt.headway_text) })),
      };
      patterns.push(pattern);
      stopIds.forEach((stopId, pos) => {
        if (!stopPatterns.has(stopId)) stopPatterns.set(stopId, []);
        stopPatterns.get(stopId).push({ p: pattern.idx, pos });
      });
    }
  }
  const grid = new Map();
  for (const stop of stopMap.values()) {
    if (!stopPatterns.has(stop.id)) continue; // trạm không thuộc tuyến nào đang chạy
    const key = cellKey(...cellOf(stop.coord));
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(stop.id);
  }
  return { version, stops: stopMap, patterns, stopPatterns, grid, nearbyCache: new Map() };
};

/** Trạm (có tuyến chạy) trong bán kính, gần nhất trước: [{ id, meters }] */
export const stopsNear = (network, point, radiusM, limit = Infinity) => {
  const [cx, cy] = cellOf(point);
  const reachX = Math.ceil(radiusM / (111320 * Math.cos((point[1] * Math.PI) / 180) * CELL_DEGREES));
  const reachY = Math.ceil(radiusM / (110540 * CELL_DEGREES));
  const found = [];
  for (let x = cx - reachX; x <= cx + reachX; x += 1) {
    for (let y = cy - reachY; y <= cy + reachY; y += 1) {
      for (const id of network.grid.get(cellKey(x, y)) ?? []) {
        const meters = metersBetween(point, network.stops.get(id).coord);
        if (meters <= radiusM) found.push({ id, meters });
      }
    }
  }
  return found.sort((a, b) => a.meters - b.meters).slice(0, limit);
};

/** Trạm đi bộ sang được để đổi tuyến (gồm chính trạm đó) */
export const transferStops = (network, stopId) => {
  if (!network.nearbyCache.has(stopId)) network.nearbyCache.set(stopId, stopsNear(network, network.stops.get(stopId).coord, TRANSIT_PLANNER.TRANSFER_WALK_M));
  return network.nearbyCache.get(stopId);
};

// ── Nạp từ MongoDB, kiểm tra dữ liệu mới định kỳ ──
let cached = { network: null, checkedAt: 0, loading: null };

const latestImport = async () => (await TransitRoute.findOne({ active: true }).sort({ imported_at: -1 }).select('imported_at').lean())?.imported_at?.getTime() ?? null;

const load = async (version) => {
  const [routes, stops] = await Promise.all([
    TransitRoute.find({ active: true, is_public: true, mode: { $in: ENABLED_TRANSIT_MODES } }).lean(),
    TransitStop.find({ active: true }).select('stop_id name code location street zone').lean(),
  ]);
  return buildNetwork(routes, stops, version);
};

export const getNetwork = async () => {
  if (cached.network && Date.now() - cached.checkedAt < TRANSIT_PLANNER.NETWORK_RELOAD_MS) return cached.network;
  if (cached.loading) return cached.loading;
  cached.loading = (async () => {
    try {
      const version = await latestImport();
      if (!cached.network || cached.network.version !== version) cached.network = await load(version);
      cached.checkedAt = Date.now();
      return cached.network;
    } finally {
      cached.loading = null;
    }
  })();
  return cached.loading;
};
