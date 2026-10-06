// API giao thông công cộng cho giao diện: trạm trong khung bản đồ, chi tiết trạm + xe sắp tới (thời gian thực),
// tuyến (lộ trình 2 chiều, giờ chạy), các tuyến metro / buýt sông để vẽ sẵn, tìm cách đi A -> B và cả chuyến nhiều điểm.
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import { ENABLED_TRANSIT_MODES, TRANSIT_BBOX_MAX_STOPS, TRANSIT_MODES, TRANSIT_REALTIME, TRANSIT_SOURCE } from '../../constants/transit.js';
import TransitRoute from '../../models/TransitRoute.model.js';
import TransitStop from '../../models/TransitStop.model.js';
import { AppError } from '../../utils/AppError.js';
import { getNetwork } from './transitNetwork.js';
import { planTransit } from './transitPlanner.js';
import { fetchTransitJson } from './transitSource.js';

const TRANSIT_ERRORS = { STOP_NOT_FOUND: 'TRANSIT_STOP_NOT_FOUND', ROUTE_NOT_FOUND: 'TRANSIT_ROUTE_NOT_FOUND', REALTIME_UNAVAILABLE: 'TRANSIT_REALTIME_UNAVAILABLE' };
const MINUTE_MS = 60000;

const stopView = (stop) => ({
  id: stop.stop_id,
  code: stop.code,
  name: stop.name,
  address: stop.address,
  zone: stop.zone,
  stop_type: stop.stop_type,
  wheelchair: stop.wheelchair,
  coordinates: { lng: stop.location.coordinates[0], lat: stop.location.coordinates[1] },
  route_numbers: stop.route_numbers,
  modes: stop.modes,
});

/** Trạm trong khung bản đồ (trạm có tuyến đang chạy) */
export const listStopsInBbox = async ({ bbox }) => {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const stops = await TransitStop.find({ active: true, modes: { $in: ENABLED_TRANSIT_MODES }, location: { $geoWithin: { $box: [[minLng, minLat], [maxLng, maxLat]] } } })
    .limit(TRANSIT_BBOX_MAX_STOPS)
    .lean();
  return { items: stops.map(stopView), attribution: TRANSIT_SOURCE.ATTRIBUTION };
};

// Tuyến dừng ở trạm (theo mạng lưới đang chạy): số tuyến, tên, màu, hướng đi
const routesAtStop = (network, stopId) =>
  (network.stopPatterns.get(stopId) ?? []).map(({ p, pos }) => {
    const pattern = network.patterns[p];
    return { route_id: pattern.routeId, number: pattern.number, name: pattern.name, color: pattern.color, mode: pattern.mode, var_id: pattern.varId, headsign: pattern.headsign, is_terminal: pos === pattern.stopIds.length - 1 };
  });

export const getStopDetail = async (stopId) => {
  const stop = await TransitStop.findOne({ stop_id: stopId }).lean();
  if (!stop) throw new AppError('Không tìm thấy trạm', HTTP_STATUS.NOT_FOUND, TRANSIT_ERRORS.STOP_NOT_FOUND);
  const network = await getNetwork();
  return { ...stopView(stop), routes: routesAtStop(network, stopId), attribution: TRANSIT_SOURCE.ATTRIBUTION };
};

// ── Xe sắp tới trạm (dự đoán theo GPS xe của Trung tâm QLGT công cộng), cache 20 giây / trạm ──
const arrivalsCache = new Map();
export const getStopArrivals = async (stopId) => {
  const cached = arrivalsCache.get(stopId);
  if (cached && Date.now() - cached.at < TRANSIT_REALTIME.CACHE_MS) return cached.data;
  let raw;
  try {
    raw = (await fetchTransitJson(`/prediction/predictbystopid/${stopId}`)) ?? [];
  } catch {
    if (cached) return cached.data;
    throw new AppError('Chưa lấy được giờ xe tới trạm, thử lại sau', HTTP_STATUS.SERVICE_UNAVAILABLE, TRANSIT_ERRORS.REALTIME_UNAVAILABLE);
  }
  const data = {
    stop_id: stopId,
    updated_at: new Date(),
    routes: raw
      .map((item) => ({
        route_id: item.r,
        number: item.rNo,
        name: item.rN,
        var_id: item.v,
        headsign: item.vN,
        arrivals: (item.arrs ?? [])
          .filter((arrival) => Number.isFinite(arrival.t))
          .sort((a, b) => a.t - b.t)
          .slice(0, TRANSIT_REALTIME.MAX_ARRIVALS_PER_ROUTE)
          .map((arrival) => ({ eta_min: Math.max(0, Math.round(arrival.t / 60)), distance_m: Math.round(arrival.d ?? 0), plate: arrival.v ?? null })),
      }))
      .filter((item) => item.arrivals.length)
      .sort((a, b) => a.arrivals[0].eta_min - b.arrivals[0].eta_min),
    attribution: TRANSIT_SOURCE.ATTRIBUTION,
  };
  arrivalsCache.set(stopId, { at: Date.now(), data });
  if (arrivalsCache.size > 500) arrivalsCache.delete(arrivalsCache.keys().next().value);
  return data;
};

const routeSummary = (route) => ({ id: route.route_id, number: route.number, name: route.name, mode: route.mode, color: route.color, type: route.type, operation_time: route.operation_time, headway_text: route.headway_text });

/** Danh sách tuyến (để tìm / duyệt) */
export const listRoutes = async () => {
  const routes = await TransitRoute.find({ active: true, is_public: true, mode: { $in: ENABLED_TRANSIT_MODES } }).select('route_id number name mode color type operation_time headway_text').lean();
  const order = { metro: 0, waterbus: 1, bus: 2 };
  return { items: routes.map(routeSummary).sort((a, b) => order[a.mode] - order[b.mode] || a.number.localeCompare(b.number, 'vi', { numeric: true })), attribution: TRANSIT_SOURCE.ATTRIBUTION };
};

/** Chi tiết tuyến: các lượt (lộ trình + trạm), giờ chuyến đầu / cuối, giá vé */
export const getRouteDetail = async (routeId) => {
  const route = await TransitRoute.findOne({ route_id: routeId }).lean();
  if (!route) throw new AppError('Không tìm thấy tuyến', HTTP_STATUS.NOT_FOUND, TRANSIT_ERRORS.ROUTE_NOT_FOUND);
  const stopIds = [...new Set(route.variants.flatMap((variant) => variant.stop_ids))];
  const stops = new Map((await TransitStop.find({ stop_id: { $in: stopIds } }).lean()).map((stop) => [stop.stop_id, stop]));
  return {
    ...routeSummary(route),
    operator: route.operator,
    distance_m: route.distance_m,
    trip_minutes: route.trip_minutes,
    tickets: route.tickets,
    variants: route.variants.map((variant) => {
      const departures = variant.timetables.flatMap((tt) => tt.departures).sort();
      return {
        var_id: variant.var_id,
        name: variant.name,
        headsign: variant.short_name || variant.end_stop,
        outbound: variant.outbound,
        distance_m: variant.distance_m,
        running_min: variant.running_min,
        first_departure: departures[0] ?? null,
        last_departure: departures.at(-1) ?? null,
        trips_per_day: variant.timetables[0]?.departures.length ?? null,
        path: variant.path,
        stops: variant.stop_ids.map((id) => stops.get(id)).filter(Boolean).map((stop) => ({ id: stop.stop_id, name: stop.name, coordinates: stop.location.coordinates })),
      };
    }),
    attribution: TRANSIT_SOURCE.ATTRIBUTION,
  };
};

/** Metro: luôn vẽ trên bản đồ khi chọn phương tiện Buýt & Metro (ít, nhẹ) */
export const listRailLines = async () => {
  const routes = await TransitRoute.find({ active: true, is_public: true, mode: TRANSIT_MODES.METRO }).lean();
  const stopIds = [...new Set(routes.flatMap((route) => route.variants.flatMap((variant) => variant.stop_ids)))];
  const stops = await TransitStop.find({ stop_id: { $in: stopIds } }).lean();
  return {
    lines: routes.map((route) => ({ ...routeSummary(route), path: route.variants[0]?.path ?? [] })),
    stations: stops.map(stopView),
    attribution: TRANSIT_SOURCE.ATTRIBUTION,
  };
};

const toPrefs = ({ priority, connector, max_walk_m: maxWalkM }) => ({ priority, connector, maxWalkM });

/** Cách đi A -> B */
export const planJourney = async ({ from, to, depart_at: departAt, ...prefs }) => {
  const network = await getNetwork();
  return { ...planTransit(network, { from, to, departAt: departAt ?? new Date(), prefs: toPrefs(prefs) }), attribution: TRANSIT_SOURCE.ATTRIBUTION };
};

/**
 * Cả chuyến nhiều điểm (vị trí hiện tại -> điểm 1 -> điểm 2...): mỗi chặng xuất phát sau khi tới điểm trước (theo phương án gợi ý)
 * + thời gian ở lại điểm đó.
 */
export const planTrip = async ({ waypoints, stays = [], depart_at: departAt, ...prefs }) => {
  const network = await getNetwork();
  let time = departAt ? new Date(departAt) : new Date();
  const legs = [];
  for (let index = 0; index < waypoints.length - 1; index += 1) {
    const plan = planTransit(network, { from: waypoints[index], to: waypoints[index + 1], departAt: time, prefs: toPrefs(prefs) });
    legs.push({ from_index: index, to_index: index + 1, ...plan });
    const minutes = (plan.options[0]?.duration_min ?? 0) + (stays[index] ?? 0);
    time = new Date(time.getTime() + minutes * MINUTE_MS);
  }
  return { legs, attribution: TRANSIT_SOURCE.ATTRIBUTION };
};
