import { findBestTransitMatch, findNearbyStops, getTransitRouteById, getTransitRoutes } from '../services/transit.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listTransitRoutes = asyncHandler(async (req, res) => {
  const { type } = req.query;
  const routes = getTransitRoutes({ type });
  return sendSuccess(res, {
    message: `Lấy thành công ${routes.length} tuyến phương tiện công cộng`,
    data: routes,
  });
});

export const getTransitRouteDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const route = getTransitRouteById(id);
  if (!route) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tuyến giao thông công cộng này' });
  }
  return sendSuccess(res, {
    message: `Chi tiết tuyến ${route.name}`,
    data: route,
  });
});

export const getNearbyTransitStops = asyncHandler(async (req, res) => {
  const lng = parseFloat(req.query.lng);
  const lat = parseFloat(req.query.lat);
  const radiusKm = parseFloat(req.query.radius_km) || 1.5;

  if (isNaN(lng) || isNaN(lat)) {
    return res.status(400).json({ success: false, message: 'Tọa độ kinh độ (lng) và vĩ độ (lat) không hợp lệ' });
  }

  const stops = findNearbyStops(lng, lat, radiusKm);
  return sendSuccess(res, {
    message: `Tìm thấy ${stops.length} trạm dừng trong bán kính ${radiusKm}km`,
    data: stops,
  });
});

export const matchTransitRoute = asyncHandler(async (req, res) => {
  const fromLng = parseFloat(req.query.from_lng);
  const fromLat = parseFloat(req.query.from_lat);
  const toLng = parseFloat(req.query.to_lng);
  const toLat = parseFloat(req.query.to_lat);

  if (isNaN(fromLng) || isNaN(fromLat) || isNaN(toLng) || isNaN(toLat)) {
    return res.status(400).json({ success: false, message: 'Tọa độ điểm đi và điểm đến không hợp lệ' });
  }

  const match = findBestTransitMatch([fromLng, fromLat], [toLng, toLat]);
  return sendSuccess(res, {
    message: match ? 'Đã tìm thấy phương án di chuyển công cộng phù hợp' : 'Không tìm thấy tuyến phù hợp kết nối 2 điểm này',
    data: match,
  });
});
