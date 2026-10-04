import { z } from 'zod';
import { DEFAULT_ORIGIN, DURATION_FILTER, PEOPLE_FILTER, RADIUS_FILTER, TRIP_BUDGET_FILTER } from '../../constants/places.js';
import { MEAL_VALUES, STAY_RANGE, VISIT_ROLE_VALUES } from '../../constants/tripRules.js';
import { DEFAULT_VEHICLE } from '../../constants/transport.js';
import { ITINERARY_MAX_STOPS, ITINERARY_NAME_MAX_LENGTH, ITINERARY_VISIBILITY } from '../../constants/social.js';
import { hashtagList, objectId, objectIdList, timeOfDay } from './common.validator.js';
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
  // ── Khuôn lộ trình (AI Planner điền; bộ lọc Khám phá có thể bỏ trống) — xem services/tripComposer.js ──
  sequence: z.array(z.enum(VISIT_ROLE_VALUES)).max(ITINERARY_MAX_STOPS).optional(), // thứ tự người dùng nói: ["meal", "drink"]
  meals: z.array(z.enum(MEAL_VALUES)).max(MEAL_VALUES.length).optional(), // các bữa muốn ăn: ["lunch"]
  food_tour: z.boolean().optional(), // đi ăn vặt nhiều món
  stop_count: z.coerce.number().int().min(1).max(ITINERARY_MAX_STOPS).nullable().optional(), // "2–3 chỗ"
  fill_duration: z.boolean().optional(), // false = thời lượng do hệ thống ước lượng => không kéo dài các điểm cho đủ giờ
  venue_id: objectId('Trung tâm thương mại').nullable().optional(), // chuyến đi trong 1 mall => ưu tiên các điểm bên trong
}).transform((criteria) => ({
  ...criteria,
  price_max: criteria.price_max ?? undefined,
  min_rating: criteria.min_rating ?? undefined,
  district: criteria.district || undefined,
  trip_budget: criteria.trip_budget ?? null,
}));

// POST /api/itineraries/preview
// Thời gian ở lại người dùng tự chỉnh: { "<placeId>": phút }
const stayOverrides = z
  .record(objectId('Địa điểm'), z.coerce.number().int().min(STAY_RANGE.MIN_MINUTES).max(STAY_RANGE.MAX_MINUTES))
  .default({});

export const previewItinerarySchema = z.object({
  criteria: tripCriteriaSchema,
  place_ids: objectIdList(ITINERARY_MAX_STOPS, 1),
  keep_order: z.boolean().default(false), // giữ đúng thứ tự (đang chỉnh 1 lộ trình đã gợi ý)
  stay_overrides: stayOverrides,
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
  stay_overrides: stayOverrides, // giữ đúng thời gian ở lại đang thấy trên lộ trình gợi ý / đã chỉnh
  tags: hashtagList.default([]),
  visibility: z.enum(Object.values(ITINERARY_VISIBILITY)).default(ITINERARY_VISIBILITY.PRIVATE),
});

// PATCH /api/itineraries/:id
export const updateItinerarySchema = z.object({
  name: z.string().trim().min(1).max(ITINERARY_NAME_MAX_LENGTH).optional(),
  place_ids: objectIdList(ITINERARY_MAX_STOPS, 1).optional(),
  vehicle: vehicleSchema.optional(),
  transport_modes: transportModes.optional(),
  people: peopleSchema.optional(),
  start_time: timeOfDay.optional(),
  origin: originSchema.optional(),
  criteria: tripCriteriaSchema.nullable().optional(),
  stay_overrides: stayOverrides.optional(),
  visibility: z.enum(Object.values(ITINERARY_VISIBILITY)).optional(),
  tags: hashtagList.optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
}).refine((changes) => Object.keys(changes).length > 0, 'Không có thông tin nào để cập nhật');

