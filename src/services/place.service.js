import {
  DEFAULT_ORIGIN,
  DURATION_FILTER,
  EXPLORE_CATEGORIES,
  GENZ_CATEGORIES,
  MIN_RATING_PRESETS,
  PEOPLE_FILTER,
  PLACE_COUNT_CAP,
  PLACE_STATUS,
  PLACE_SORTS,
  PLACE_RELAX_STEPS,
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
import { isMall } from '../utils/venue.js';

const METERS_PER_KM = 1000;
const DISTRICT_CACHE_TTL_MS = 10 * 60 * 1000;
const districtCache = createMemoryCache(DISTRICT_CACHE_TTL_MS);
const EXPLORE_CATEGORY_VALUES = EXPLORE_CATEGORIES.map((category) => category.value);

const SORT_STAGES = {
  rating: { rating: -1, review_count: -1 },
  popular: { review_count: -1, rating: -1, confidence: -1 },
  price_asc: { 'price_range.min': 1, rating: -1 },
  tiktok_trend: { 'tiktok_metadata.trend_score': -1, review_count: -1 },
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
      { $multiply: [{ $ifNull: ['$tiktok_metadata.trend_score', 0] }, 0.005] },
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
  genz_categories: GENZ_CATEGORIES,
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
const buildFilterQuery = ({
  categories,
  genz_categories,
  student_friendly,
  tiktok_trending,
  tags,
  price_min: priceMin,
  price_max: priceMax,
  min_rating: minRating,
  district,
  q,
}) => {
  // Nơi đã đóng cửa (cộng đồng xác nhận / biến mất khỏi nguồn) không bao giờ hiện trong tìm kiếm + gợi ý lộ trình.
  const query = { category: { $in: categories?.length ? categories : EXPLORE_CATEGORY_VALUES }, status: { $ne: PLACE_STATUS.CLOSED } };
  if (genz_categories?.length) query.genz_category = { $in: genz_categories };
  if (student_friendly) query['experience.student_friendly'] = true;
  if (tiktok_trending) query['tiktok_metadata.viral_level'] = { $in: ['viral', 'trending'] };
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
    community_rating: { average: place.community_rating?.average ?? 0, count: place.community_rating?.count ?? 0 }, // đánh giá của người dùng MapMate
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
    kind: place.kind ?? null, // loại chi tiết (restaurant, coffee, museum...) — suy vai trò điểm dừng
    venue: place.parent_place_id ? { id: place.parent_place_id, name: place.parent_place_name } : null, // nằm trong mall nào
    contact: place.contact ?? null,
    image_url: place.image_url ?? null,
    genz_category: place.genz_category ?? null,
    genz_sub_category: place.genz_sub_category ?? null,
    tiktok_metadata: place.tiktok_metadata ?? null,
    experience: place.experience ?? null,
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
const runSearch = async (filters, userId) => {
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

const isActive = (value) => (Array.isArray(value) ? value.length > 0 : value != null && value !== '' && value !== 0);

/**
 * Nới dần bộ lọc cho tới khi có kết quả: chỉ bỏ những điều kiện ĐANG bật, theo thứ tự PLACE_RELAX_STEPS.
 * @returns {{ result, relaxed: { keys, labels, radius_km? } } | null} null = nới hết vẫn không có
 */
const searchRelaxed = async (filters, userId) => {
  const next = { ...filters };
  const relaxed = { keys: [], labels: [] };
  // Có từ khoá ("phở hòa") => người dùng tìm đúng quán đó: bỏ 1 lần mọi bộ lọc đang bật (như bấm "Đặt lại bộ lọc"),
  // nới từng bước sẽ dừng ở quán na ná tên ("Cà Phê Phố") trong khi quán thật bị bộ lọc loại hình chặn
  const steps = filters.q
    ? [PLACE_RELAX_STEPS.filter((step) => !step.widen && step.keys.some((key) => isActive(filters[key]))).reduce((all, step) => ({ keys: [...all.keys, ...step.keys], labels: [...all.labels, step.label] }), { keys: [], labels: [] })]
    : PLACE_RELAX_STEPS;
  for (const step of steps) {
    const widen = step.widen && !filters.q && (filters.radius_km ?? RADIUS_FILTER.default) < RADIUS_FILTER.max;
    if (!widen && (step.widen || !step.keys.some((key) => isActive(filters[key])))) continue;
    step.keys.forEach((key) => (widen ? (next[key] = RADIUS_FILTER.max) : delete next[key]));
    relaxed.keys.push(...step.keys);
    relaxed.labels.push(...(step.labels ?? [step.label]));
    if (widen) relaxed.radius_km = RADIUS_FILTER.max;
    const result = await runSearch(next, userId);
    if (result.total > 0) return { result, relaxed };
  }
  return null;
};

// GET /api/places/nearby — auto_relax: không có kết quả thì tự nới bộ lọc (người dùng khỏi phải bấm "Đặt lại bộ lọc")
export const searchPlaces = async (filters, userId) => {
  const result = await runSearch(filters, userId);
  if (result.total > 0 || !filters.auto_relax || filters.page > 1) return { ...result, relaxed: null };
  const found = await searchRelaxed(filters, userId);
  return found ? { ...found.result, relaxed: found.relaxed } : { ...result, relaxed: null };
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

// ── Tra địa điểm theo tên (AI Planner: "xuất phát từ Landmark 81", "phải ghé Chợ Bến Thành", "món ốc") ──

const NAME_LOOKUP_CANDIDATES = 15;
// Tên chính của 1 địa danh ("Khu du lịch Suối Tiên") hơn tên trò chơi / quán bên trong ("Roller Coaster (Suoi Tien Park)")
const MAIN_PLACE_PREFIX = /^(khu du lich|cong vien|thao cam vien|bao tang|cho|trung tam thuong mai|nha tho|chua|dinh|pho di bo)\b/;
const nameScore = (place, needle) => {
  const name = normalizeSearchText(place.name);
  if (name === needle) return 3;
  if (name.startsWith(needle) || needle.startsWith(name)) return 2;
  if (!name.includes(needle)) return 0;
  // chứa từ khoá: tên càng ngắn (từ khoá chiếm phần lớn) + có tiền tố địa danh chính => càng đúng
  return 1 + (needle.length / name.length) * 0.5 + (MAIN_PLACE_PREFIX.test(name) ? 0.3 : 0);
};

/**
 * Tìm các địa điểm khớp `text` (không dấu, không phân biệt hoa thường) quanh `near` [lng, lat], trong `radiusKm`.
 * Ưu tiên tên khớp đúng > tên bắt đầu bằng > tên chứa > (cùng điểm) đã kiểm chứng > gần hơn. Không gồm nơi đã đóng cửa.
 */
// preferLandmarks: người dùng gọi tên 1 địa danh ("Suối Tiên") => ưu tiên khu vui chơi / điểm tham quan hơn quán ăn mượn tên khu vực
// ("Ẩm Thực Suối Tiên"). Tên quán khớp chính xác vẫn thắng (điểm khớp tên cao hơn).
const LANDMARK_CATEGORIES = new Set(['park', 'attraction', 'entertainment', 'shopping']);
const LANDMARK_BONUS = 0.6;

export const lookupPlacesByText = async (text, { near, radiusKm, categories, limit = 1, preferLandmarks = false }) => {
  const needle = normalizeSearchText(text);
  if (!needle) return [];
  const query = { search_text: { $regex: escapeRegExp(needle) }, status: { $ne: PLACE_STATUS.CLOSED } };
  if (categories?.length) query.category = { $in: categories };
  const search = (match) => Place.aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: near }, distanceField: 'distance_m', maxDistance: radiusKm * METERS_PER_KM, query: match, spherical: true } },
    { $limit: NAME_LOOKUP_CANDIDATES },
  ]);
  // Tìm địa danh: tìm riêng trong nhóm địa danh — "Crescent Mall" khớp địa chỉ của hàng chục quán bên trong,
  // nếu chỉ lấy 15 nơi gần nhất thì chính cái mall có thể bị lọt
  const landmarkCategories = [...LANDMARK_CATEGORIES].filter((category) => !categories?.length || categories.includes(category));
  const groups = await Promise.all([search(query), ...(preferLandmarks && landmarkCategories.length ? [search({ ...query, category: { $in: landmarkCategories } })] : [])]);
  const candidates = [...new Map(groups.flat().map((place) => [String(place._id), place])).values()];
  return candidates
    .map((place) => ({
      place,
      score: nameScore(place, needle) + (place.review_count > 0 ? 0.5 : 0) + (preferLandmarks && LANDMARK_CATEGORIES.has(place.category) ? LANDMARK_BONUS : 0) - place.distance_m / (radiusKm * METERS_PER_KM),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ place }) => place);
};

const MALL_LOOKUP_CANDIDATES = 40;
const MIN_INSIDE_PLACES = 3;
// Mall cho "đi mall chơi" (không nói mall nào): trong các mall có ≥ 3 quán / rạp bên trong, chọn nơi vừa gần vừa nhiều
// chỗ bên trong — chuyến đi mall mà không có chỗ ăn trong mall thì không trọn vẹn
export const findNearestMall = async ([lng, lat], radiusKm) => {
  const shops = await Place.aggregate([
    { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'distance_m', maxDistance: radiusKm * METERS_PER_KM, query: { category: 'shopping', status: { $ne: PLACE_STATUS.CLOSED } }, spherical: true } },
    { $limit: MALL_LOOKUP_CANDIDATES },
  ]);
  const malls = shops.filter(isMall);
  if (!malls.length) return null;
  const inside = await Place.aggregate([{ $match: { parent_place_id: { $in: malls.map((mall) => mall._id) } } }, { $group: { _id: '$parent_place_id', count: { $sum: 1 } } }]);
  const counts = new Map(inside.map((row) => [String(row._id), row.count]));
  // Cân bằng "gần" và "nhiều chỗ bên trong": Vincom 28 quán cách 1 km hơn Diamond Plaza 4 quán cách 0.8 km
  const worth = (mall) => (counts.get(String(mall._id)) ?? 0) / (1 + mall.distance_m / METERS_PER_KM);
  const rich = malls.filter((mall) => (counts.get(String(mall._id)) ?? 0) >= MIN_INSIDE_PLACES);
  return rich.length ? rich.reduce((best, mall) => (worth(mall) > worth(best) ? mall : best)) : malls[0];
};

// Các điểm nằm trong 1 mall (quán ăn, cà phê, rạp...) — chuyến đi mall lấy thêm làm ứng viên
export const findPlacesInVenue = (venueId) => Place.find({ parent_place_id: venueId, status: { $ne: PLACE_STATUS.CLOSED } }).lean();

// Tâm của 1 quận = trung bình toạ độ các địa điểm trong quận (cache 10 phút) — làm điểm xuất phát khi chỉ nói "ở Quận 4".

export const getDistrictCenter = (district) =>
  districtCache.wrap(`center:${district}`, async () => {
    const [row] = await Place.aggregate([
      { $match: { district } },
      { $group: { _id: null, lng: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } }, lat: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } }, count: { $sum: 1 } } },
    ]);
    return row?.count ? { lng: roundTo(row.lng, 5), lat: roundTo(row.lat, 5) } : null;
  });
