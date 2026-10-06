import { z } from 'zod';
import { TRANSIT_CONNECTORS, TRANSIT_PLANNER, TRANSIT_PRIORITY_VALUES, WALK_ROUTER } from '../../constants/transit.js';
import { metersBetween } from '../../services/transit/transitGeometry.js';
import { latitude, longitude } from './place.validator.js';

const MAX_BBOX_SPAN = 0.3; // trạm buýt dày => chỉ lấy khi đã phóng to
const bbox = z
  .string('Thiếu khung bản đồ')
  .transform((value) => value.split(',').map(Number))
  .refine((parts) => parts.length === 4 && parts.every(Number.isFinite), 'Khung bản đồ không hợp lệ')
  .refine(([minLng, minLat, maxLng, maxLat]) => maxLng > minLng && maxLat > minLat && maxLng - minLng <= MAX_BBOX_SPAN && maxLat - minLat <= MAX_BBOX_SPAN, 'Khung bản đồ quá lớn, hãy phóng to bản đồ');
const lngLat = z.tuple([longitude, latitude], 'Toạ độ phải là [kinh độ, vĩ độ]');
const MAX_TRIP_POINTS = 12;

// Ưu tiên của người dùng khi chọn cách đi
const preferences = {
  priority: z.enum(TRANSIT_PRIORITY_VALUES, 'Ưu tiên phải là fastest, least_walk hoặc cheapest').default('fastest'),
  connector: z.enum(TRANSIT_CONNECTORS, 'Cách ra trạm phải là auto, walk hoặc ride').default('auto'),
  max_walk_m: z.coerce.number().int().min(TRANSIT_PLANNER.MAX_WALK_ACCESS_M.MIN).max(TRANSIT_PLANNER.MAX_WALK_ACCESS_M.MAX).default(TRANSIT_PLANNER.MAX_WALK_ACCESS_M.DEFAULT),
  depart_at: z.coerce.date('Giờ xuất phát không hợp lệ').optional(),
};

export const transitStopsQuerySchema = z.object({ bbox });
export const transitStopParam = z.object({ stopId: z.coerce.number().int().positive('Mã trạm không hợp lệ') });
export const transitRouteParam = z.object({ routeId: z.coerce.number().int().positive('Mã tuyến không hợp lệ') });
export const transitPlanSchema = z.object({ from: lngLat, to: lngLat, ...preferences });
export const transitTripSchema = z.object({
  waypoints: z.array(lngLat).min(2, 'Cần ít nhất điểm đi và điểm đến').max(MAX_TRIP_POINTS, `Tối đa ${MAX_TRIP_POINTS} điểm`),
  stays: z.array(z.coerce.number().min(0).max(24 * 60)).max(MAX_TRIP_POINTS).optional(),
  ...preferences,
});
// Đường đi bộ: chỉ chặng ngắn (ra / rời trạm, đổi trạm, đi bộ cả chặng)
export const transitWalkSchema = z
  .object({ from: lngLat, to: lngLat })
  .refine(({ from, to }) => metersBetween(from, to) <= WALK_ROUTER.MAX_DISTANCE_M, 'Quãng đi bộ quá xa');
