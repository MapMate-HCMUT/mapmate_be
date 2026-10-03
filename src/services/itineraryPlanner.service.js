import { DEFAULT_VISIT_MINUTES, EXPLORE_CATEGORIES } from '../constants/places.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { ITINERARY_MAX_STOPS } from '../constants/social.js';
import { AppError } from '../utils/AppError.js';
import { TRANSPORT_MODES } from '../constants/transport.js';
import { addMinutesToTime, haversineKm, isOpenAt, roundTo } from '../utils/geo.js';
import { planLeg, resolveModes } from '../utils/transport.js';
import { findCandidatePlaces, getPlacesByIds, toPlaceView } from './place.service.js';

const MINUTES_PER_HOUR = 60;
const AVG_MINUTES_PER_STOP = 75; // ~60 phút ở lại + ~15 phút di chuyển
const MIN_STOPS = 2;
const MAX_AUTO_STOPS = 6;
const MAX_OPTIONS = 3;
const CATEGORY_ORDER = EXPLORE_CATEGORIES.map((category) => category.value);
const MIN_RATING_SCALE = 3; // điểm < 3 coi như 0
const MAX_RATING = 5;
// 1 điểm dừng không được "ăn" quá 1.8 lần phần ngân sách chia đều cho các điểm còn lại.
const BUDGET_SHARE_FACTOR = 1.8;
// Phong cách (hẹn hò, gia đình...) là ưu tiên mạnh chứ không phải điều kiện cứng => vẫn ra lộ trình khi ít điểm khớp.
const STYLE_WEIGHT = 0.6;
// Nơi chưa ai đánh giá (dữ liệu mở): coi như ~3.6★ thay vì 0 — không bị loại hẳn, nhưng thua nơi đã được đánh giá tốt.
const UNRATED_RATING_SCORE = 0.3;
// Chưa rõ giờ mở cửa => có rủi ro tới nơi thấy đóng cửa: trừ nhẹ điểm để ưu tiên nơi biết giờ.
const UNKNOWN_HOURS_PENALTY = 0.15;

const isUnrated = (place) => !(place.review_count > 0) && !(place.rating > 0);

const avgPrice = (place) => (place.price_range.min + place.price_range.max) / 2;

/**
 * Mỗi chiến lược là 1 bộ trọng số trên 4 tiêu chí đã chuẩn hoá về 0–1 => từ cùng 1 bộ lọc ra nhiều lộ trình khác nhau.
 * Thêm chiến lược mới (VD "ít ngập nhất", "AI gợi ý") chỉ cần thêm 1 phần tử vào đây.
 */
const STRATEGIES = [
  {
    key: 'budget', label: 'Tiết kiệm nhất', emoji: '💸',
    description: 'Ưu tiên địa điểm giá mềm mà vẫn được đánh giá tốt',
    weights: { price: 0.6, rating: 0.2, popularity: 0.05, proximity: 0.15 },
  },
  {
    key: 'top_rated', label: 'Được yêu thích nhất', emoji: '⭐',
    description: 'Ưu tiên nơi có điểm đánh giá cao và nhiều lượt nhận xét',
    weights: { price: 0.05, rating: 0.55, popularity: 0.3, proximity: 0.1 },
  },
  {
    key: 'nearby', label: 'Gần & ít di chuyển', emoji: '📍',
    description: 'Ưu tiên các điểm gần bạn nhất để đỡ tốn thời gian đi lại',
    weights: { price: 0.1, rating: 0.2, popularity: 0.05, proximity: 0.65 },
  },
  {
    key: 'balanced', label: 'Cân bằng', emoji: '⚖️',
    description: 'Hài hoà giữa giá, khoảng cách và đánh giá',
    weights: { price: 0.3, rating: 0.3, popularity: 0.1, proximity: 0.3 },
  },
];

const countStops = (durationHours, mustIncludeCount) => {
  const byDuration = Math.round((durationHours * MINUTES_PER_HOUR) / AVG_MINUTES_PER_STOP);
  return Math.min(ITINERARY_MAX_STOPS, Math.max(MIN_STOPS, mustIncludeCount, Math.min(MAX_AUTO_STOPS, byDuration)));
};

// Chuẩn hoá từng tiêu chí về 0–1 (1 = tốt nhất) theo chính tập ứng viên, để cộng trọng số có ý nghĩa.
const buildScorer = (candidates, { tags, radiusKm }) => {
  const maxPrice = Math.max(1, ...candidates.map(avgPrice));
  const maxReviewLog = Math.max(1, ...candidates.map((place) => Math.log10(1 + (place.review_count ?? 0))));
  const tagSet = new Set(tags);

  const features = (place) => ({
    price: 1 - avgPrice(place) / maxPrice,
    rating: isUnrated(place) ? UNRATED_RATING_SCORE : Math.max(0, (place.rating - MIN_RATING_SCALE) / (MAX_RATING - MIN_RATING_SCALE)),
    popularity: Math.log10(1 + (place.review_count ?? 0)) / maxReviewLog,
    proximity: Math.max(0, 1 - place.distance_m / 1000 / radiusKm),
    style: tagSet.size ? (place.tags ?? []).filter((tag) => tagSet.has(tag)).length / tagSet.size : 0,
  });

  return (place, weights) => {
    const feature = features(place);
    const penalty = place.hours_known === false ? UNKNOWN_HOURS_PENALTY : 0;
    return Object.entries(weights).reduce((sum, [key, weight]) => sum + feature[key] * weight, feature.style * STYLE_WEIGHT - penalty);
  };
};

const rankCandidates = (candidates, strategy, score) =>
  [...candidates].sort((a, b) => score(b, strategy.weights) - score(a, strategy.weights));

// Chọn trạm: giữ các điểm người dùng đã chọn, rồi lần lượt mỗi loại hình 1 điểm tốt nhất (đa dạng), không vượt ngân sách.
const selectStops = (candidates, strategy, { stopsCount, categoryOrder, mustInclude, tripBudget, score }) => {
  const chosen = [...mustInclude];
  const usedIds = new Set(chosen.map((place) => String(place._id)));
  let spent = chosen.reduce((sum, place) => sum + avgPrice(place), 0);

  const ranked = rankCandidates(candidates, strategy, score);
  const byCategory = Map.groupBy(ranked, (place) => place.category);
  const fitsBudget = (place) => {
    if (tripBudget == null) return true;
    const remaining = tripBudget - spent;
    const fairShare = (remaining / (stopsCount - chosen.length)) * BUDGET_SHARE_FACTOR;
    return avgPrice(place) <= Math.min(remaining, fairShare);
  };

  let progressed = true;
  while (chosen.length < stopsCount && progressed) {
    progressed = false;
    for (const category of categoryOrder) {
      if (chosen.length >= stopsCount) break;
      const pick = (byCategory.get(category) ?? []).find((place) => !usedIds.has(String(place._id)) && fitsBudget(place));
      if (!pick) continue;
      chosen.push(pick);
      usedIds.add(String(pick._id));
      spent += avgPrice(pick);
      progressed = true;
    }
  }
  return chosen;
};

const CLOSED_PENALTY = 1000; // km "ảo": đẩy điểm đang đóng cửa xuống cuối
const SAME_CATEGORY_PENALTY = 2.5; // tránh 2 quán ăn / 2 quán cà phê liền nhau

/**
 * Xếp thứ tự đi kiểu "điểm gần nhất tiếp theo", có tính giờ: ưu tiên điểm đang mở cửa lúc dự kiến tới nơi
 * và tránh 2 điểm cùng loại liền nhau.
 */
const orderStops = (origin, places, { modes, people, startTime }) => {
  const remaining = [...places];
  const ordered = [];
  let current = origin;
  let clock = startTime;
  let previousCategory = null;

  const costOf = (place) => {
    const travel = planLeg(current, place.location.coordinates, { modes, people });
    const closed = !isOpenAt(place.opening_hours, addMinutesToTime(clock, travel.minutes));
    return travel.distanceKm * (place.category === previousCategory ? SAME_CATEGORY_PENALTY : 1) + (closed ? CLOSED_PENALTY : 0);
  };

  while (remaining.length > 0) {
    const next = remaining.reduce((best, place) => (costOf(place) < costOf(best) ? place : best));
    remaining.splice(remaining.indexOf(next), 1);
    ordered.push(next);
    const travel = planLeg(current, next.location.coordinates, { modes, people });
    clock = addMinutesToTime(clock, travel.minutes + (next.avg_visit_minutes ?? DEFAULT_VISIT_MINUTES));
    current = next.location.coordinates;
    previousCategory = next.category;
  }
  return ordered;
};

// Gộp các đoạn di chuyển theo từng phương tiện: bao nhiêu chặng, km, phút, tiền.
const summarizeTransport = (stops) => {
  const byMode = new Map();
  stops.flatMap((stop) => stop.travel.segments).forEach((item) => {
    const row = byMode.get(item.mode) ?? { mode: item.mode, label: TRANSPORT_MODES[item.mode].label, emoji: item.emoji, legs: 0, distance_km: 0, minutes: 0, cost_per_person: 0 };
    row.legs += 1;
    row.distance_km = roundTo(row.distance_km + item.distance_km);
    row.minutes += item.minutes;
    row.cost_per_person += item.cost_per_person;
    byMode.set(item.mode, row);
  });
  return [...byMode.values()].sort((a, b) => b.distance_km - a.distance_km);
};

/**
 * Dựng lịch trình từ danh sách địa điểm ĐÃ có thứ tự: giờ đến, cách di chuyển từng chặng, chi phí
 * và bảng TỔNG HỢP (summary) — thời gian, quãng đường, ngân sách, so với giới hạn người dùng đặt.
 * Dùng chung cho gợi ý lộ trình, xem trước và khi lưu => số liệu luôn do server tính, không tin client.
 */
export const buildPlan = (orderedPlaces, { origin, modes, startTime, people, tripBudget = null, durationHours = null }) => {
  let cursor = [origin.lng, origin.lat];
  let clock = startTime;

  const stops = orderedPlaces.map((place) => {
    const travel = planLeg(cursor, place.location.coordinates, { modes, people });
    const stay = place.avg_visit_minutes ?? DEFAULT_VISIT_MINUTES;
    const arrival = addMinutesToTime(clock, travel.minutes);
    clock = addMinutesToTime(arrival, stay);
    cursor = place.location.coordinates;
    return {
      place: toPlaceView(place),
      arrival_time: arrival,
      stay_minutes: stay,
      travel_minutes: travel.minutes,
      distance_km: travel.distanceKm,
      est_cost: Math.round(avgPrice(place)),
      open_on_arrival: isOpenAt(place.opening_hours, arrival),
      travel: { mode: travel.mode, label: travel.label, emoji: travel.emoji, cost_per_person: travel.costPerPerson, segments: travel.segments },
    };
  });

  const sum = (pick) => stops.reduce((total, stop) => total + pick(stop), 0);
  const travelMinutes = sum((stop) => stop.travel_minutes);
  const visitMinutes = sum((stop) => stop.stay_minutes);
  const placesCost = sum((stop) => stop.est_cost);
  const transportCost = sum((stop) => stop.travel.cost_per_person);
  const costPerPerson = placesCost + transportCost;
  const durationLimit = durationHours ? durationHours * MINUTES_PER_HOUR : null;
  const rated = orderedPlaces.filter((place) => place.rating > 0);

  const summary = {
    stop_count: stops.length,
    people,
    start_time: startTime,
    end_time: clock,
    total_minutes: travelMinutes + visitMinutes,
    travel_minutes: travelMinutes,
    visit_minutes: visitMinutes,
    total_distance_km: roundTo(sum((stop) => stop.distance_km)),
    places_cost_per_person: placesCost,
    transport_cost_per_person: transportCost,
    cost_per_person: costPerPerson,
    total_cost: costPerPerson * people,
    trip_budget: tripBudget,
    budget_left: tripBudget == null ? null : tripBudget - costPerPerson,
    within_budget: tripBudget == null || costPerPerson <= tripBudget,
    duration_limit_minutes: durationLimit,
    time_left_minutes: durationLimit == null ? null : durationLimit - (travelMinutes + visitMinutes),
    within_duration: durationLimit == null || travelMinutes + visitMinutes <= durationLimit,
    avg_rating: rated.length ? roundTo(rated.reduce((total, place) => total + place.rating, 0) / rated.length) : null,
    all_open: stops.every((stop) => stop.open_on_arrival), // false => có điểm đóng cửa lúc bạn tới
    unknown_hours_stops: orderedPlaces.filter((place) => place.hours_known === false).length, // nên kiểm tra giờ trước khi đi
    estimated_price_stops: orderedPlaces.filter((place) => place.price_estimated).length, // giá là ước tính theo loại hình
    transport: summarizeTransport(stops),
  };

  return { stops, place_ids: orderedPlaces.map((place) => place._id), summary };
};

// Các thông số dựng lịch trình lấy từ bộ tiêu chí chuyến đi.
export const toPlanInput = (criteria) => ({
  origin: criteria.origin,
  modes: resolveModes(criteria.vehicle, criteria.transport_modes),
  startTime: criteria.start_time,
  people: criteria.people,
  tripBudget: criteria.trip_budget ?? null,
  durationHours: criteria.duration_hours ?? null,
});

const MAX_REPAIR_ROUNDS = 3;
const REPLACEMENT_PRICE_FACTOR = 1.5; // điểm thay thế không được đắt hơn quá 1.5 lần điểm cũ (+20k)
const REPLACEMENT_PRICE_SLACK = 20000;

/**
 * Sắp thứ tự + dựng lịch trình; nếu có trạm ĐÓNG CỬA lúc tới nơi thì thay bằng điểm cùng loại tốt nhất đang mở
 * vào giờ đó rồi sắp lại (tối đa 3 vòng). Điểm người dùng tự chọn không bao giờ bị thay.
 */
const planWithOpenStops = (stops, { origin, planInput, ranked, lockedIds }) => {
  let chosen = stops;
  let plan = buildPlan(orderStops(origin, chosen, planInput), planInput);

  for (let round = 0; round < MAX_REPAIR_ROUNDS && !plan.summary.all_open; round += 1) {
    const usedIds = new Set(chosen.map((place) => String(place._id)));
    let replaced = false;
    plan.stops.filter((stop) => !stop.open_on_arrival && !lockedIds.has(String(stop.place.id))).forEach((stop) => {
      const substitute = ranked.find(
        (place) =>
          place.category === stop.place.category &&
          !usedIds.has(String(place._id)) &&
          isOpenAt(place.opening_hours, stop.arrival_time) &&
          avgPrice(place) <= stop.est_cost * REPLACEMENT_PRICE_FACTOR + REPLACEMENT_PRICE_SLACK,
      );
      if (!substitute) return;
      chosen = chosen.map((place) => (String(place._id) === String(stop.place.id) ? substitute : place));
      usedIds.add(String(substitute._id));
      replaced = true;
    });
    if (!replaced) break;
    plan = buildPlan(orderStops(origin, chosen, planInput), planInput);
  }
  return plan;
};

const OPEN_CHECK_STEP_MINUTES = 30;

// Địa điểm có mở cửa vào ít nhất 1 thời điểm trong suốt chuyến đi không? (kiểm tra mỗi 30 phút)
const isOpenDuringTrip = (place, startTime, durationHours) => {
  const steps = Math.ceil((durationHours * MINUTES_PER_HOUR) / OPEN_CHECK_STEP_MINUTES);
  return Array.from({ length: steps }, (_, index) => addMinutesToTime(startTime, index * OPEN_CHECK_STEP_MINUTES)).some((time) =>
    isOpenAt(place.opening_hours, time),
  );
};

const toPlaceFilters = (criteria) => ({
  lat: criteria.origin.lat,
  lng: criteria.origin.lng,
  radius_km: criteria.radius_km,
  categories: criteria.categories,
  // Cố ý KHÔNG lọc cứng theo criteria.tags: phong cách được cộng điểm ưu tiên trong buildScorer.
  price_min: criteria.price_min,
  price_max: criteria.price_max,
  min_rating: criteria.min_rating,
  district: criteria.district,
  open_at: criteria.open_only ? criteria.start_time : undefined,
});

// POST /api/itineraries/suggest — từ bộ lọc (+ các điểm đã chọn) sinh ra tối đa 3 lộ trình khác nhau.
export const suggestItineraries = async (criteria, mustIncludeIds = []) => {
  const origin = [criteria.origin.lng, criteria.origin.lat];
  const [found, mustIncludeRaw] = await Promise.all([
    findCandidatePlaces(toPlaceFilters(criteria)),
    getPlacesByIds(mustIncludeIds),
  ]);
  // Bỏ những nơi đóng cửa suốt chuyến đi (VD đi lúc 22:00 thì không gợi ý bảo tàng).
  const candidates = found.filter((place) => isOpenDuringTrip(place, criteria.start_time, criteria.duration_hours));
  const mustInclude = mustIncludeRaw.map((place) => ({ ...place, distance_m: haversineKm(origin, place.location.coordinates) * 1000 }));

  if (candidates.length + mustInclude.length === 0) {
    throw new AppError('Không có địa điểm nào khớp bộ lọc. Hãy nới bán kính hoặc bỏ bớt điều kiện.', HTTP_STATUS.UNPROCESSABLE_ENTITY, EXPLORE_ERROR_CODES.NO_MATCHING_PLACES);
  }

  const selection = {
    stopsCount: countStops(criteria.duration_hours, mustInclude.length),
    categoryOrder: criteria.categories.length ? criteria.categories : CATEGORY_ORDER,
    mustInclude,
    tripBudget: criteria.trip_budget ?? null,
    score: buildScorer([...candidates, ...mustInclude], { tags: criteria.tags, radiusKm: criteria.radius_km }),
  };
  const planInput = toPlanInput(criteria);

  const seen = new Set();
  const options = [];
  for (const strategy of STRATEGIES) {
    const stops = selectStops(candidates, strategy, selection);
    const signature = stops.map((place) => String(place._id)).sort().join(',');
    if (seen.has(signature)) continue; // 2 chiến lược ra cùng 1 tập điểm => bỏ bản trùng
    seen.add(signature);

    const plan = planWithOpenStops(stops, {
      origin, planInput,
      ranked: rankCandidates(candidates, strategy, selection.score),
      lockedIds: new Set(mustInclude.map((place) => String(place._id))),
    });
    // Sau khi thay điểm đóng cửa, 2 phương án có thể lại trùng nhau
    const finalSignature = plan.place_ids.map(String).sort().join(',');
    if (finalSignature !== signature && seen.has(finalSignature)) continue;
    seen.add(finalSignature);
    options.push({
      key: strategy.key,
      label: strategy.label,
      emoji: strategy.emoji,
      description: strategy.description,
      suggested_name: `${strategy.label} · ${plan.stops.length} điểm`,
      ...plan,
    });
    if (options.length === MAX_OPTIONS) break;
  }

  // Người dùng đã tự chọn đủ điểm => không còn gì để "tiết kiệm" hay "gần nhất": gọi đúng tên là lộ trình của họ.
  const mustIncludeIdSet = new Set(mustInclude.map((place) => String(place._id)));
  if (options.length === 1 && options[0].place_ids.every((id) => mustIncludeIdSet.has(String(id)))) {
    Object.assign(options[0], {
      key: 'custom', label: 'Theo lựa chọn của bạn', emoji: '🧭',
      description: 'Giữ đúng các điểm bạn đã chọn, sắp xếp lại cho thuận đường',
      suggested_name: `Chuyến đi ${options[0].stops.length} điểm của tôi`,
    });
  }

  return { criteria, candidate_count: candidates.length, options };
};

// POST /api/itineraries/preview — tổng hợp nhanh cho đúng các điểm người dùng đang chọn (sắp lại cho thuận đường).
export const previewItinerary = async (criteria, placeIds) => {
  const places = await getPlacesByIds(placeIds);
  const planInput = toPlanInput(criteria);
  return buildPlan(orderStops([criteria.origin.lng, criteria.origin.lat], places, planInput), planInput);
};
