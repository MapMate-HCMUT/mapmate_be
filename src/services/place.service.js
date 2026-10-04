import {
  DEFAULT_ORIGIN,
  DURATION_FILTER,
  EXPLORE_CATEGORIES,
  MIN_RATING_PRESETS,
  PEOPLE_FILTER,
  PLACE_COUNT_CAP,
  PLACE_STATUS,
  PLACE_SORTS,
  PLACE_TAGS,
  PLANNER_CANDIDATES_PER_CATEGORY,
  PRICE_FILTER,
  RADIUS_FILTER,
  RECOMMENDED_SORT_WEIGHTS,
  TRIP_BUDGET_FILTER,
} from '../constants/places.js';
import { OPEN_DATA_ATTRIBUTION, PLACE_SOURCES } from '../constants/openData.js';
import {
  CUSTOM_MODE_VALUES,
  DEFAULT_CUSTOM_MODES,
  DEFAULT_VEHICLE,
  FARES_UPDATED_AT,
  METRO_LINE_1,
  TRANSPORT_MODES,
  VEHICLES,
} from '../constants/transport.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import Place from '../models/Place.model.js';
import { PlacePin } from '../models/placePin.model.js';
import { AppError } from '../utils/AppError.js';
import { roundTo } from '../utils/geo.js';
import { planLeg, resolveModes } from '../utils/transport.js';
import { createMemoryCache } from '../utils/memoryCache.js';
import { getMyReportMap } from './placeReport.service.js';
import { escapeRegExp, normalizeSearchText } from '../utils/text.js';

const METERS_PER_KM = 1000;
const DISTRICT_CACHE_TTL_MS = 10 * 60 * 1000;
const districtCache = createMemoryCache(DISTRICT_CACHE_TTL_MS);
const EXPLORE_CATEGORY_VALUES = EXPLORE_CATEGORIES.map((category) => category.value);

const SORT_STAGES = {
  rating: { rating: -1, review_count: -1 },
  popular: { review_count: -1, rating: -1, confidence: -1 },
  price_asc: { 'price_range.min': 1, rating: -1 },
};

// Điểm "Đề xuất" (constants/places.js): đã có đánh giá + biết giờ mở cửa + độ tin cậy + gần.
const buildRecommendedRank = (radiusKm) => {
  const weights = RECOMMENDED_SORT_WEIGHTS;
  return {
    $add: [
      { $cond: [{ $gt: ['$review_count', 0] }, weights.reviewed, 0] },
      { $cond: [{ $eq: ['$hours_known', false] }, 0, weights.hoursKnown] },
      { $multiply: [{ $ifNull: ['$confidence', 1] }, weights.confidence] },
      { $multiply: [{ $max: [0, { $subtract: [1, { $divide: ['$distance_m', radiusKm * METERS_PER_KM] }] }] }, weights.proximity] },
      { $cond: [{ $eq: ['$status', PLACE_STATUS.MAYBE_CLOSED] }, weights.maybeClosed, 0] },
    ],
  };
};
const sortStages = (sort, radiusKm) => {
  if (sort === 'recommended') return [{ $addFields: { _rank: buildRecommendedRank(radiusKm) } }, { $sort: { _rank: -1 } }];
  return SORT_STAGES[sort] ? [{ $sort: SORT_STAGES[sort] }] : []; // 'distance': $geoNear đã xếp theo khoảng cách
};

const formatK = (amount) => `${amount.toLocaleString('vi-VN')}đ`;

// "Quận 2" < "Quận 10" < "Bình Thạnh"... (số theo giá trị, sau đó tên theo bảng chữ cái tiếng Việt)
const districtNumber = (name) => Number(name.match(/^Quận (\d+)$/)?.[1] ?? Infinity);
const compareDistricts = (a, b) => districtNumber(a) - districtNumber(b) || a.localeCompare(b, 'vi');

// Giá vé metro hiện hành để gợi ý cho người dùng (số liệu lấy từ constants/transport.js).
// Chỉ hiện metro: xe buýt đang miễn phí; Grab / xe cá nhân vẫn được tính vào chi phí lộ trình nhưng không liệt kê ở đây.
const buildFareInfo = () => {
  const { name, fare, passes } = METRO_LINE_1;
  return {
    updated_at: FARES_UPDATED_AT,
    items: [
      {
        mode: 'metro', emoji: '🚇', title: name,
        lines: [
          `Vé lượt: ${formatK(fare.min)} – ${formatK(fare.max)} tuỳ quãng đường`,
          `Thanh toán không tiền mặt: giảm ${formatK(fare.cashlessDiscount)}/lượt`,
          `Vé ngày ${formatK(passes.day)} · vé 3 ngày ${formatK(passes.threeDays)}`,
          `Vé tháng ${formatK(passes.month)} (học sinh, sinh viên ${formatK(passes.monthStudent)})`,
        ],
      },
    ],
  };
};

// GET /api/places/filter-options — 1 nguồn duy nhất cho mọi lựa chọn của bộ lọc (frontend + AI Planner dùng chung).
export const getFilterOptions = async () => ({
  categories: EXPLORE_CATEGORIES,
  tags: PLACE_TAGS,
  vehicles: VEHICLES.filter((vehicle) => !vehicle.hidden).map(({ value, label, emoji, description, modes }) => ({ value, label, emoji, description, modes })),
  custom_modes: CUSTOM_MODE_VALUES.map((value) => ({ value, label: TRANSPORT_MODES[value].label, emoji: TRANSPORT_MODES[value].emoji })),
  fares: buildFareInfo(),
  sorts: PLACE_SORTS,
  price: PRICE_FILTER,
  trip_budget: TRIP_BUDGET_FILTER,
  radius: RADIUS_FILTER,
  people: PEOPLE_FILTER,
  duration: DURATION_FILTER,
  min_ratings: MIN_RATING_PRESETS,
  districts: await districtCache.wrap('districts', async () => (await Place.distinct('district')).filter(Boolean).sort(compareDistricts)),
  attribution: Object.values(OPEN_DATA_ATTRIBUTION), // bắt buộc hiển thị khi dùng dữ liệu OSM / Overture
  defaults: { origin: DEFAULT_ORIGIN, vehicle: DEFAULT_VEHICLE, duration_hours: DURATION_FILTER.default, custom_modes: DEFAULT_CUSTOM_MODES },
});

// Điều kiện lọc thường (đi theo index) — dùng cho $geoNear.query
const buildFilterQuery = ({ categories, tags, price_min: priceMin, price_max: priceMax, min_rating: minRating, district, q }) => {
  // Nơi đã đóng cửa (cộng đồng xác nhận / biến mất khỏi nguồn) không bao giờ hiện trong tìm kiếm + gợi ý lộ trình.
  const query = { category: { $in: categories?.length ? categories : EXPLORE_CATEGORY_VALUES }, status: { $ne: PLACE_STATUS.CLOSED } };
  if (tags?.length) query.tags = { $in: tags };
  if (priceMax !== undefined) query['price_range.min'] = { $lte: priceMax };
  if (priceMin) query['price_range.max'] = { $gte: priceMin };
  if (minRating) query.rating = { $gte: minRating };
  if (district) query.district = district;
  if (q) query.search_text = { $regex: escapeRegExp(normalizeSearchText(q)) };
  return query;
};

// "Đang mở cửa lúc HH:mm": không có giờ = mở cả ngày; close < open = mở qua đêm. So sánh chuỗi "HH:mm" là đủ.
const buildOpenAtMatch = (time) => ({
  $expr: {
    $or: [
      { $eq: [{ $ifNull: ['$opening_hours.open', null] }, null] },
      {
        $cond: [
          { $lte: ['$opening_hours.open', '$opening_hours.close'] },
          { $and: [{ $lte: ['$opening_hours.open', time] }, { $lt: [time, '$opening_hours.close'] }] },
          { $or: [{ $lte: ['$opening_hours.open', time] }, { $lt: [time, '$opening_hours.close'] }] },
        ],
      },
    ],
  },
});

// Gõ tên cụ thể ("Suối Tiên", "Đầm Sen") => tìm khắp thành phố, không bị thanh bán kính (mặc định 5 km) chặn mất.
const searchRadiusKm = (filters) => (filters.q ? RADIUS_FILTER.max : filters.radius_km ?? RADIUS_FILTER.default);

const buildNearbyPipeline = (filters) => {
  const { lat = DEFAULT_ORIGIN.lat, lng = DEFAULT_ORIGIN.lng, open_at: openAt } = filters;
  const radiusKm = searchRadiusKm(filters);
  return [
    {
      $geoNear: {
        near: { type: 'Point', coordinates: [lng, lat] },
        distanceField: 'distance_m',
        maxDistance: radiusKm * METERS_PER_KM,
        query: buildFilterQuery(filters),
        spherical: true,
      },
    },
    ...(openAt ? [{ $match: buildOpenAtMatch(openAt) }] : []),
  ];
};

export const toPlaceView = (place, { pin, report } = {}) => {
  const [lng, lat] = place.location.coordinates;
  const view = {
    id: place._id,
    name: place.name,
    address: place.address,
    district: place.district,
    category: place.category,
    coordinates: { lng, lat },
    rating: place.rating,
    review_count: place.review_count ?? 0,
    price_range: place.price_range,
    tags: place.tags ?? [],
    specialties: place.specialties ?? [],
    opening_hours: place.opening_hours?.open ? place.opening_hours : null,
    hours_known: place.hours_known !== false, // false => opening_hours = null nghĩa là CHƯA RÕ, không phải mở cả ngày
    avg_visit_minutes: place.avg_visit_minutes,
    is_trending: Boolean(place.is_trending),
    source: place.source ?? PLACE_SOURCES.MAPMATE,
    price_estimated: Boolean(place.price_estimated),
    cuisines: place.cuisines ?? [],
    contact: place.contact ?? null,
    image_url: place.image_url ?? null,
    status: place.status ?? PLACE_STATUS.ACTIVE,
    report_counts: place.report_counts ?? { closed: 0, open: 0 },
    data_updated_at: place.cached_at ?? null, // lần cuối lấy từ nguồn (Overture / OSM làm mới hằng tháng)
  };
  if (place.distance_m !== undefined) view.distance_km = roundTo(place.distance_m / METERS_PER_KM, 2);
  if (pin !== undefined) view.my_pin = pin;
  if (report !== undefined) view.my_report = report;
  return view;
};

const getPinMap = async (userId, placeIds) => {
  if (!userId || placeIds.length === 0) return new Map();
  const pins = await PlacePin.find({ user_id: userId, place_id: { $in: placeIds } }, { place_id: 1, status: 1 }).lean();
  return new Map(pins.map((pin) => [String(pin.place_id), pin.status]));
};

// Ghim + phiếu báo đóng cửa của người đang xem (khách chưa đăng nhập => không có 2 trường này).
const viewerState = (userId, place, pinMap, reportMap) =>
  userId ? { pin: pinMap.get(String(place._id)) ?? null, report: reportMap.get(String(place._id)) ?? null } : {};

// GET /api/places/nearby — tìm địa điểm theo bộ lọc, có phân trang và tổng số kết quả.
export const searchPlaces = async (filters, userId) => {
  const { sort, page, limit, vehicle, transport_modes: customModes, lat = DEFAULT_ORIGIN.lat, lng = DEFAULT_ORIGIN.lng } = filters;
  const modes = resolveModes(vehicle, customModes);
  const [result] = await Place.aggregate([
    ...buildNearbyPipeline(filters),
    {
      $facet: {
        items: [...sortStages(sort, searchRadiusKm(filters)), { $skip: (page - 1) * limit }, { $limit: limit }],
        total: [{ $limit: PLACE_COUNT_CAP + 1 }, { $count: 'count' }],
      },
    },
  ]);

  const counted = result.total[0]?.count ?? 0;
  const total = Math.min(counted, PLACE_COUNT_CAP);
  const placeIds = result.items.map((place) => place._id);
  const [pinMap, reportMap] = await Promise.all([getPinMap(userId, placeIds), getMyReportMap(userId, placeIds)]);
  const items = result.items.map((place) => {
    const leg = planLeg([lng, lat], place.location.coordinates, { modes });
    return {
      ...toPlaceView(place, viewerState(userId, place, pinMap, reportMap)),
      travel_minutes: leg.minutes,
      travel: { mode: leg.mode, emoji: leg.emoji, label: leg.label, cost_per_person: leg.costPerPerson }, // cách đi nhanh/rẻ nhất tới đây
    };
  });

  return { items, page, limit, total, total_capped: counted > PLACE_COUNT_CAP, has_more: page * limit < counted, radius_km: searchRadiusKm(filters) };
};

// Thứ tự chất lượng cho ứng viên lộ trình: đã kiểm chứng (có đánh giá) -> biết giờ mở cửa -> độ tin cậy.
const CANDIDATE_QUALITY_SORT = { review_count: -1, rating: -1, hours_known: -1, confidence: -1 };

/**
 * Ứng viên cho bộ lên lộ trình (kèm distance_m). Hàng chục nghìn nơi => không thể lấy "N nơi gần nhất" (toàn quán sát vách),
 * mà lấy theo TỪNG loại hình: N nơi chất lượng nhất trong bán kính + M nơi gần nhất, rồi gộp, bỏ trùng.
 */
export const findCandidatePlaces = async (filters) => {
  const categories = filters.categories?.length ? filters.categories : EXPLORE_CATEGORY_VALUES;
  const { best, nearest } = PLANNER_CANDIDATES_PER_CATEGORY;
  const facets = Object.fromEntries(
    categories.flatMap((category) => [
      [`${category}_best`, [{ $match: { category } }, { $sort: CANDIDATE_QUALITY_SORT }, { $limit: best }]],
      [`${category}_near`, [{ $match: { category } }, { $limit: nearest }]], // $geoNear đã xếp theo khoảng cách
    ]),
  );
  const [groups] = await Place.aggregate([...buildNearbyPipeline({ ...filters, categories }), { $facet: facets }]);
  const unique = new Map(Object.values(groups).flat().map((place) => [String(place._id), place]));
  return [...unique.values()];
};

export const getPlaceById = async (placeId, userId) => {
  const place = await Place.findById(placeId).lean();
  if (!place) throw new AppError('Không tìm thấy địa điểm', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  const [pinMap, reportMap] = await Promise.all([getPinMap(userId, [place._id]), getMyReportMap(userId, [place._id])]);
  return toPlaceView(place, viewerState(userId, place, pinMap, reportMap));
};

export const getPlacesByIds = async (placeIds) => {
  const places = await Place.find({ _id: { $in: placeIds } }).lean();
  const byId = new Map(places.map((place) => [String(place._id), place]));
  const missing = placeIds.find((id) => !byId.has(String(id)));
  if (missing) throw new AppError('Có địa điểm không còn tồn tại', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  return placeIds.map((id) => byId.get(String(id))); // giữ đúng thứ tự người dùng chọn
};
