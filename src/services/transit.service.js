import { TRANSIT_ROUTES, TRANSIT_TYPES } from '../constants/transitRoutes.js';
import { haversineKm, roundTo } from '../utils/geo.js';

/**
 * Lấy danh sách các tuyến Metro & Xe buýt
 * @param {Object} options
 * @param {string} [options.type] - 'metro' | 'bus' | 'electric_bus'
 */
export const getTransitRoutes = ({ type } = {}) => {
  let routes = TRANSIT_ROUTES;
  if (type) {
    routes = routes.filter((r) => r.type === type);
  }

  return routes.map((r) => ({
    id: r.id,
    route_number: r.route_number,
    name: r.name,
    short_name: r.short_name,
    type: r.type,
    color: r.color,
    bg_color: r.bg_color,
    badge_label: r.badge_label,
    distance_km: r.distance_km,
    operating_hours: r.operating_hours,
    headway_minutes: r.headway_minutes,
    fare_info: r.fare_info,
    description: r.description,
    total_stops: r.stops.length,
    first_stop: r.stops[0]?.name,
    last_stop: r.stops.at(-1)?.name,
  }));
};

/**
 * Lấy chi tiết một tuyến cụ thể kèm toàn bộ tọa độ và danh sách trạm dừng
 * @param {string} routeId
 */
export const getTransitRouteById = (routeId) => {
  const route = TRANSIT_ROUTES.find((r) => r.id === routeId);
  if (!route) return null;
  return route;
};

/**
 * Tìm các trạm dừng / ga công cộng gần một tọa độ
 * @param {number} lng
 * @param {number} lat
 * @param {number} [radiusKm=1.5]
 */
export const findNearbyStops = (lng, lat, radiusKm = 1.5) => {
  const point = [lng, lat];
  const results = [];

  for (const route of TRANSIT_ROUTES) {
    for (const [index, stop] of route.stops.entries()) {
      const dist = haversineKm(point, [stop.lng, stop.lat]);
      if (dist <= radiusKm) {
        results.push({
          stop_id: stop.id,
          name: stop.name,
          address: stop.address,
          coordinates: [stop.lng, stop.lat],
          distance_km: roundTo(dist, 2),
          route_id: route.id,
          route_number: route.route_number,
          route_name: route.name,
          route_type: route.type,
          route_color: route.color,
          stop_index: index,
        });
      }
    }
  }

  // Sắp xếp theo trạm gần nhất
  return results.sort((a, b) => a.distance_km - b.distance_km);
};

/**
 * Gợi ý tuyến xe buýt hoặc ga Metro thực tế phù hợp nhất kết nối 2 điểm A và B
 * @param {[number, number]} fromCoord - [lng, lat]
 * @param {[number, number]} toCoord - [lng, lat]
 * @param {number} [maxAccessKm=1.5] - Khoảng cách tối đa từ điểm xuất phát tới trạm đón
 */
export const findBestTransitMatch = (fromCoord, toCoord, maxAccessKm = 1.5) => {
  const candidates = [];

  for (const route of TRANSIT_ROUTES) {
    let bestBoarding = null;
    let bestAlighting = null;
    let minBoardingDist = Infinity;
    let minAlightingDist = Infinity;

    for (const [idx, stop] of route.stops.entries()) {
      const dFrom = haversineKm(fromCoord, [stop.lng, stop.lat]);
      const dTo = haversineKm(toCoord, [stop.lng, stop.lat]);

      if (dFrom < minBoardingDist) {
        minBoardingDist = dFrom;
        bestBoarding = { stop, index: idx, dist: dFrom };
      }
      if (dTo < minAlightingDist) {
        minAlightingDist = dTo;
        bestAlighting = { stop, index: idx, dist: dTo };
      }
    }

    // Trạm đón phải gần A, trạm xuống phải gần B và trạm đón phải đi trước trạm xuống (hoặc tuyến hai chiều)
    if (
      bestBoarding &&
      bestAlighting &&
      bestBoarding.dist <= maxAccessKm &&
      bestAlighting.dist <= maxAccessKm &&
      bestBoarding.stop.id !== bestAlighting.stop.id
    ) {
      const stopCount = Math.abs(bestAlighting.index - bestBoarding.index);
      const score = bestBoarding.dist + bestAlighting.dist; // Càng gần cả 2 đầu càng tốt

      candidates.push({
        route_id: route.id,
        route_number: route.route_number,
        route_name: route.name,
        route_type: route.type,
        color: route.color,
        boarding_stop: bestBoarding.stop,
        alighting_stop: bestAlighting.stop,
        stop_count: stopCount,
        access_walk_km: roundTo(bestBoarding.dist, 2),
        egress_walk_km: roundTo(bestAlighting.dist, 2),
        score,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Chọn tuyến có tổng khoảng cách đi bộ 2 đầu ngắn nhất
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0];
};
