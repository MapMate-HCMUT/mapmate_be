import { z } from 'zod';
import {
  EXPLORE_CATEGORIES,
  PLACE_SEARCH_DEFAULT_LIMIT,
  PLACE_SEARCH_MAX_LIMIT,
  PLACE_SORT_VALUES,
  PLACE_TAG_VALUES,
  RADIUS_FILTER,
} from '../../constants/places.js';
import { CUSTOM_MODE_VALUES, DEFAULT_VEHICLE, VEHICLE_VALUES } from '../../constants/transport.js';
import { csvList, timeOfDay } from './common.validator.js';

export const categorySchema = z.enum(EXPLORE_CATEGORIES.map((category) => category.value), 'Loại hình không hợp lệ');
export const placeTagSchema = z.enum(PLACE_TAG_VALUES, 'Phong cách không hợp lệ');
export const vehicleSchema = z.enum(VEHICLE_VALUES, 'Phương tiện không hợp lệ');
// Các phương tiện tự chọn khi vehicle = 'custom'
export const customModeSchema = z.enum(CUSTOM_MODE_VALUES, 'Phương tiện kết hợp không hợp lệ');
export const latitude = z.coerce.number('Vĩ độ không hợp lệ').min(-90, 'Vĩ độ không hợp lệ').max(90, 'Vĩ độ không hợp lệ');
export const longitude = z.coerce.number('Kinh độ không hợp lệ').min(-180, 'Kinh độ không hợp lệ').max(180, 'Kinh độ không hợp lệ');
const RADIUS_MESSAGE = `Bán kính từ ${RADIUS_FILTER.min} đến ${RADIUS_FILTER.max} km`;
export const radiusKm = z.coerce.number(RADIUS_MESSAGE).min(RADIUS_FILTER.min, RADIUS_MESSAGE).max(RADIUS_FILTER.max, RADIUS_MESSAGE);
export const priceAmount = z.coerce.number('Số tiền không hợp lệ').int('Số tiền không hợp lệ').min(0, 'Số tiền không được âm');
export const ratingFloor = z.coerce.number('Điểm đánh giá từ 0 đến 5').min(0, 'Điểm đánh giá từ 0 đến 5').max(5, 'Điểm đánh giá từ 0 đến 5');

// GET /api/places/nearby
export const nearbyQuerySchema = z.object({
  lat: latitude.optional(),
  lng: longitude.optional(),
  radius_km: radiusKm.default(RADIUS_FILTER.default),
  categories: csvList(categorySchema),
  tags: csvList(placeTagSchema),
  price_min: priceAmount.optional(),
  price_max: priceAmount.optional(),
  min_rating: ratingFloor.optional(),
  district: z.string().trim().max(60).optional(),
  q: z.string().trim().max(80).optional(),
  open_at: timeOfDay.optional(),
  vehicle: vehicleSchema.default(DEFAULT_VEHICLE),
  transport_modes: csvList(customModeSchema),
  sort: z.enum(PLACE_SORT_VALUES, 'Kiểu sắp xếp không hợp lệ').default('distance'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(PLACE_SEARCH_MAX_LIMIT).default(PLACE_SEARCH_DEFAULT_LIMIT),
});
