import { z } from 'zod';
import { DEFAULT_ORIGIN, DURATION_FILTER, PEOPLE_FILTER, RADIUS_FILTER, TRIP_BUDGET_FILTER } from '../../constants/places.js';
import { DEFAULT_VEHICLE } from '../../constants/transport.js';
import { ITINERARY_MAX_STOPS, ITINERARY_NAME_MAX_LENGTH, ITINERARY_VISIBILITY } from '../../constants/social.js';
import { hashtagList, objectIdList, timeOfDay } from './common.validator.js';
import { categorySchema, customModeSchema, latitude, longitude, placeTagSchema, priceAmount, radiusKm, ratingFloor, vehicleSchema } from './place.validator.js';

const DEFAULT_START_TIME = '09:00';

const originSchema = z.object({
  lat: latitude,
  lng: longitude,
  label: z.string().trim().max(120).optional(),
});
const PEOPLE_MESSAGE = `Số người từ ${PEOPLE_FILTER.min} đến ${PEOPLE_FILTER.max}`;
const DURATION_MESSAGE = `Thời lượng từ ${DURATION_FILTER.min} đến ${DURATION_FILTER.max} giờ`;
const BUDGET_MESSAGE = `Tổng ngân sách từ ${TRIP_BUDGET_FILTER.min / 1000}k đến ${TRIP_BUDGET_FILTER.max / 1000}k mỗi người`;
const transportModes = z.array(customModeSchema).max(4).transform((modes) => [...new Set(modes)]);
const peopleSchema = z.coerce.number(PEOPLE_MESSAGE).int(PEOPLE_MESSAGE).min(PEOPLE_FILTER.min, PEOPLE_MESSAGE).max(PEOPLE_FILTER.max, PEOPLE_MESSAGE);

/**
 * BỘ TIÊU CHÍ CHUYẾN ĐI — chính là "bộ lọc" người dùng chọn ở trang Khám phá.
 * Được dùng để: (1) gợi ý nhiều lộ trình, (2) lưu kèm lộ trình (Itinerary.criteria), (3) làm đầu vào cho AI Planner.
 */
export const tripCriteriaSchema = z.object({
  origin: originSchema.default(DEFAULT_ORIGIN),
  categories: z.array(categorySchema).max(10).default([]),
  tags: z.array(placeTagSchema).max(12).default([]),
  price_min: priceAmount.default(0), // đ / người / điểm
  price_max: priceAmount.nullable().optional(), // null = không giới hạn
  trip_budget: priceAmount.min(TRIP_BUDGET_FILTER.min, BUDGET_MESSAGE).max(TRIP_BUDGET_FILTER.max, BUDGET_MESSAGE).nullable().optional(), // đ / người / cả chuyến; null = không giới hạn
  people: peopleSchema.default(PEOPLE_FILTER.default),
  vehicle: vehicleSchema.default(DEFAULT_VEHICLE),
  transport_modes: transportModes.default([]), // chỉ dùng khi vehicle = 'custom'
  radius_km: radiusKm.default(RADIUS_FILTER.default),
  min_rating: ratingFloor.nullable().optional(),
  start_time: timeOfDay.default(DEFAULT_START_TIME),
  duration_hours: z.coerce.number(DURATION_MESSAGE).int(DURATION_MESSAGE).min(DURATION_FILTER.min, DURATION_MESSAGE).max(DURATION_FILTER.max, DURATION_MESSAGE).default(DURATION_FILTER.default),
  open_only: z.boolean().default(false),
  district: z.string().trim().max(60).nullable().optional(),
}).transform((criteria) => ({
  ...criteria,
  price_max: criteria.price_max ?? undefined,
  min_rating: criteria.min_rating ?? undefined,
  district: criteria.district || undefined,
  trip_budget: criteria.trip_budget ?? null,
}));

// POST /api/itineraries/preview
export const previewItinerarySchema = z.object({
  criteria: tripCriteriaSchema,
  place_ids: objectIdList(ITINERARY_MAX_STOPS, 1),
});

// POST /api/itineraries/suggest
export const suggestItinerarySchema = z.object({
  criteria: tripCriteriaSchema,
  place_ids: objectIdList(ITINERARY_MAX_STOPS).default([]), // các điểm người dùng đã tự chọn (bắt buộc có trong lộ trình)
});

// POST /api/itineraries
export const createItinerarySchema = z.object({
  name: z.string('Vui lòng đặt tên lộ trình').trim().min(1, 'Vui lòng đặt tên lộ trình').max(ITINERARY_NAME_MAX_LENGTH),
  place_ids: objectIdList(ITINERARY_MAX_STOPS, 1),
  vehicle: vehicleSchema.default(DEFAULT_VEHICLE),
  transport_modes: transportModes.default([]),
  people: peopleSchema.default(PEOPLE_FILTER.default),
  start_time: timeOfDay.default(DEFAULT_START_TIME),
  origin: originSchema.default(DEFAULT_ORIGIN),
  criteria: tripCriteriaSchema.nullable().optional(),
  tags: hashtagList.default([]),
  visibility: z.enum(Object.values(ITINERARY_VISIBILITY)).default(ITINERARY_VISIBILITY.PRIVATE),
});

// PATCH /api/itineraries/:id
export const updateItinerarySchema = z.strictObject({
  name: z.string().trim().min(1).max(ITINERARY_NAME_MAX_LENGTH).optional(),
  visibility: z.enum(Object.values(ITINERARY_VISIBILITY)).optional(),
  tags: hashtagList.optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
}).refine((changes) => Object.keys(changes).length > 0, 'Không có thông tin nào để cập nhật');
