import { DEFAULT_VISIT_MINUTES, PLACE_STATUS } from '../constants/places.js';
import { MEAL_RULES, STRETCH, VISIT_ROLES } from '../constants/tripRules.js';
import { SAME_VENUE_BONUS, VENUE_TRIP_BONUS, VENUE_WALK_MINUTES } from '../constants/venues.js';
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { TRANSPORT_MODES } from '../constants/transport.js';
import { addMinutesToTime, haversineKm, isOpenAt, roundTo } from '../utils/geo.js';
import { clampStayOverride, getStayRange } from '../utils/stayTime.js';
import { insideVenueLeg, planLeg, resolveModes } from '../utils/transport.js';
import { sameVenue, venueOf } from '../utils/venue.js';
import { normalizeSearchText } from '../utils/text.js';
import { getVisitRole } from '../utils/visitRole.js';
import { validatePlanStops } from './itineraryValidator.js';
import { findCandidatePlaces, findPlacesInVenue, getPlacesByIds, toPlaceView } from './place.service.js';
import { composeSlots, mealAt, toMinutes, waitBeforeStop } from './tripComposer.js';

const MINUTES_PER_HOUR = 60;
const MAX_OPTIONS = 3;
const MIN_RATING_SCALE = 3; // điểm < 3 coi như 0
const MAX_RATING = 5;
// Chia ngân sách theo vai trò: bữa chính "nặng" hơn đồ uống / ăn vặt. 1 điểm được vượt phần của mình tối đa 1.4 lần.
const ROLE_BUDGET_WEIGHT = { meal: 2, snack: 0.6, drink: 0.8, activity: 1 };
const BUDGET_SHARE_FACTOR = 1.4;
// Chọn điểm kế tiếp gần điểm trước (không chỉ gần điểm xuất phát) => lộ trình liền mạch, ít chạy vòng
const LEG_DISTANCE_WEIGHT = 0.35;
const LEG_LOOKAHEAD = 25; // xét 25 ứng viên tốt nhất của vai trò đó
// Vai trò -> loại hình được phép lấp vào (giao với loại hình người dùng chọn, nếu có)
const ROLE_CATEGORIES = {
  meal: ['food'],
  snack: ['food', 'cafe'],
  drink: ['cafe', 'entertainment'],
  activity: ['attraction', 'entertainment', 'park', 'shopping'],
};
const slotCategories = (role, userCategories) => {
  const base = ROLE_CATEGORIES[role];
  const picked = userCategories?.length ? base.filter((category) => userCategories.includes(category)) : base;
  return picked.length ? picked : base;
};
// Phong cách (hẹn hò, gia đình...) là ưu tiên mạnh chứ không phải điều kiện cứng => vẫn ra lộ trình khi ít điểm khớp.
const STYLE_WEIGHT = 0.6;
// Nơi chưa ai đánh giá (dữ liệu mở): coi như ~3.6★ thay vì 0 — không bị loại hẳn, nhưng thua nơi đã được đánh giá tốt.
const UNRATED_RATING_SCORE = 0.3;
// Chưa rõ giờ mở cửa => có rủi ro tới nơi thấy đóng cửa: trừ nhẹ điểm để ưu tiên nơi biết giờ.
const UNKNOWN_HOURS_PENALTY = 0.15;
// Có người báo đã đóng cửa (chưa đủ xác nhận) => gần như không chọn, trừ khi người dùng tự thêm.
const MAYBE_CLOSED_PENALTY = 0.8;

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
    const penalty = (place.hours_known === false ? UNKNOWN_HOURS_PENALTY : 0) + (place.status === PLACE_STATUS.MAYBE_CLOSED ? MAYBE_CLOSED_PENALTY : 0);
    return Object.entries(weights).reduce((sum, [key, weight]) => sum + feature[key] * weight, feature.style * STYLE_WEIGHT - penalty);
  };
};

const rankCandidates = (candidates, strategy, score) =>
  [...candidates].sort((a, b) => score(b, strategy.weights) - score(a, strategy.weights));

/**
 * Lấp quán thật vào từng vị trí của khuôn (tripComposer): đúng vai trò + loại hình, vừa phần ngân sách của vị trí đó,
 * ưu tiên điểm tốt theo chiến lược VÀ gần điểm trước. Giữ nguyên thứ tự khuôn (không sắp lại) => đúng giờ ăn, đúng ý người dùng.
 */
const fillSlots = (slots, ranked, { strategy, score, tripBudget, userCategories, origin, radiusKm, venueId = null }) => {
  const chosen = [];
  const targetMeals = []; // bữa dự định của từng điểm đã chọn (để chờ đúng giờ ăn)
  const usedIds = new Set(slots.filter((slot) => slot.fixed).map((slot) => String(slot.fixed._id)));
  let spent = slots.reduce((sum, slot) => sum + (slot.fixed ? avgPrice(slot.fixed) : 0), 0);
  let previous = origin;
  let previousPlace = null;
  // Cùng mall với điểm trước ("ăn luôn trong Vincom") / thuộc mall của chuyến đi mall => ưu tiên
  const venueBonus = (place) => (sameVenue(previousPlace, place) ? SAME_VENUE_BONUS : 0) + (venueId && venueOf(place)?.id === venueId ? VENUE_TRIP_BONUS : 0);

  slots.forEach((slot, index) => {
    if (slot.fixed) {
      chosen.push(slot.fixed);
      targetMeals.push(slot.meal);
      previous = slot.fixed.location.coordinates;
      previousPlace = slot.fixed;
      return;
    }
    const open = slots.slice(index).filter((item) => !item.fixed);
    const weightLeft = open.reduce((sum, item) => sum + ROLE_BUDGET_WEIGHT[item.role], 0);
    const share = tripBudget == null ? Infinity : ((tripBudget - spent) * ROLE_BUDGET_WEIGHT[slot.role] * BUDGET_SHARE_FACTOR) / weightLeft;
    const allowed = slotCategories(slot.role, userCategories);
    // Chuyến đi mall: điểm vui chơi thêm phải ở TRONG mall (rạp, khu trò chơi) — không có thì bỏ, dạo mall lâu hơn
    const insideOnly = venueId && slot.role === VISIT_ROLES.ACTIVITY;
    const matches = ranked
      .filter((place) => !usedIds.has(String(place._id)) && place.role === slot.role && allowed.includes(place.category) && avgPrice(place) <= Math.min(share, tripBudget == null ? Infinity : tripBudget - spent))
      .filter((place) => !insideOnly || venueOf(place)?.id === venueId)
      .sort((a, b) => venueBonus(b) - venueBonus(a)) // điểm trong mall vào vòng xét trước (giữ thứ tự chiến lược trong từng nhóm)
      .slice(0, LEG_LOOKAHEAD);
    if (!matches.length) return; // không có quán phù hợp => bỏ vị trí này (lộ trình ngắn hơn, không nhét bừa)
    const legScore = (place) => score(place, strategy.weights) + venueBonus(place) - LEG_DISTANCE_WEIGHT * Math.min(1, haversineKm(previous, place.location.coordinates) / radiusKm);
    const pick = matches.reduce((best, place) => (legScore(place) > legScore(best) ? place : best));
    chosen.push(pick);
    targetMeals.push(slot.meal);
    usedIds.add(String(pick._id));
    spent += avgPrice(pick);
    previous = pick.location.coordinates;
    previousPlace = pick;
  });
  return { chosen, targetMeals };
};

const CLOSED_PENALTY = 1000; // km "ảo": đẩy điểm đang đóng cửa xuống cuối
const SAME_ROLE_PENALTY = 2.5; // tránh 2 quán cà phê / 2 điểm ăn vặt liền nhau
const MEAL_AFTER_MEAL_PENALTY = 50; // 2 bữa chính liền nhau gần như không bao giờ hợp lý

/**
 * Xếp thứ tự đi kiểu "điểm gần nhất tiếp theo", có tính giờ: ưu tiên điểm đang mở cửa lúc dự kiến tới nơi
 * và tránh 2 điểm cùng loại liền nhau.
 */
const orderStops = (origin, places, { modes, people, startTime }) => {
  const remaining = [...places];
  const ordered = [];
  let current = origin;
  let clock = startTime;
  let previousRole = null;

  const costOf = (place) => {
    const travel = planLeg(current, place.location.coordinates, { modes, people });
    const closed = !isOpenAt(place.opening_hours, addMinutesToTime(clock, travel.minutes));
    const role = getVisitRole(place);
    const rolePenalty = role === VISIT_ROLES.MEAL && previousRole === VISIT_ROLES.MEAL ? MEAL_AFTER_MEAL_PENALTY : role === previousRole ? SAME_ROLE_PENALTY : 1;
    return travel.distanceKm * rolePenalty + (closed ? CLOSED_PENALTY : 0);
  };

  while (remaining.length > 0) {
    const next = remaining.reduce((best, place) => (costOf(place) < costOf(best) ? place : best));
    remaining.splice(remaining.indexOf(next), 1);
    ordered.push(next);
    const travel = planLeg(current, next.location.coordinates, { modes, people });
    clock = addMinutesToTime(clock, travel.minutes + (next.avg_visit_minutes ?? DEFAULT_VISIT_MINUTES));
    current = next.location.coordinates;
    previousRole = getVisitRole(next);
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

// Chặng tới 1 điểm: cùng mall với điểm trước => đi bộ trong mall; còn lại => phương tiện tốt nhất
const legTo = (previousPlace, place, from, { modes, people }) => {
  if (previousPlace && sameVenue(previousPlace, place)) return insideVenueLeg(venueOf(place).name, VENUE_WALK_MINUTES);
  return planLeg(from, place.location.coordinates, { modes, people });
};

/**
 * 1 lượt dựng: giờ đến, chặng đi, thời gian ở lại (trong khoảng cho phép), thời gian chờ tới giờ ăn.
 * Chờ tới giờ ăn => ưu tiên ở điểm trước lâu hơn (dạo mall / ngồi cà phê thêm, trong khoảng tối đa của nó), còn thiếu mới
 * chừa "thời gian tự do". Điểm người dùng tự chỉnh thời gian (stayOverrides) giữ nguyên, không bị kéo dài.
 */
const buildStops = (orderedPlaces, { origin, modes, startTime, people }, { targetMeals, stayOverrides, stayExtras }) => {
  let cursor = [origin.lng, origin.lat];
  let clock = startTime;
  const lastAt = { lastMealMinutes: null, lastSnackMinutes: null };
  const stops = [];

  orderedPlaces.forEach((place, index) => {
    const id = String(place._id);
    const role = getVisitRole(place);
    const range = getStayRange(place, role, people);
    const override = stayOverrides[id];
    const stay = override != null ? clampStayOverride(override) : Math.min(range.max, range.typical + (stayExtras[id] ?? 0));
    const travel = legTo(orderedPlaces[index - 1], place, cursor, { modes, people });

    let reachedAt = addMinutesToTime(clock, travel.minutes);
    const needed = waitBeforeStop(role, reachedAt, { ...lastAt, targetMeal: targetMeals[index] });
    const previous = stops.at(-1);
    const extendLimit = previous?.role === VISIT_ROLES.ACTIVITY ? Math.max(previous.stay_range.max, previous.stay_typical + MEAL_RULES.MAX_EXTEND_ACTIVITY_MINUTES) : previous?.stay_range.max;
    const canExtend = previous && !previous.stay_locked ? Math.max(0, extendLimit - previous.stay_minutes) : 0;
    const extend = Math.min(needed, canExtend);
    const fits = needed - extend <= MEAL_RULES.MAX_FREE_MINUTES; // chờ quá lâu => giữ giờ, bộ kiểm tra cảnh báo
    const freeMinutes = fits ? needed - extend : 0;
    if (fits && extend) {
      previous.stay_minutes += extend;
      previous.stay_range.max = Math.max(previous.stay_range.max, previous.stay_minutes);
      reachedAt = addMinutesToTime(reachedAt, extend);
    }
    const arrival = addMinutesToTime(reachedAt, freeMinutes);
    if (role === VISIT_ROLES.MEAL) lastAt.lastMealMinutes = toMinutes(arrival);
    if (role === VISIT_ROLES.SNACK) lastAt.lastSnackMinutes = toMinutes(arrival);
    clock = addMinutesToTime(arrival, stay);
    cursor = place.location.coordinates;
    stops.push({
      place: toPlaceView(place),
      role, // bữa chính / ăn vặt / đồ uống / vui chơi
      meal: role === VISIT_ROLES.MEAL ? mealAt(arrival) : null, // bữa nào trong ngày
      venue: venueOf(place), // nằm trong mall nào (hoặc chính là mall) — null nếu không
      arrival_time: arrival,
      free_minutes_before: freeMinutes, // thời gian tự do trước điểm này (chờ tới giờ ăn)
      stay_minutes: stay,
      stay_range: { min: range.min, max: Math.max(range.max, stay) }, // khoảng hợp lý để người dùng chỉnh ±15′
      stay_locked: override != null, // người dùng đã tự chỉnh
      stay_typical: range.typical,
      travel_minutes: travel.minutes,
      distance_km: travel.distanceKm,
      est_cost: Math.round(avgPrice(place)),
      open_on_arrival: isOpenAt(place.opening_hours, arrival),
      travel: { mode: travel.mode, label: travel.label, emoji: travel.emoji, cost_per_person: travel.costPerPerson, segments: travel.segments },
    });
  });
  return { stops, endTime: clock };
};

const stopsMinutes = (stops) => stops.reduce((total, stop) => total + stop.travel_minutes + stop.stay_minutes + stop.free_minutes_before, 0);

// Lộ trình ngắn hơn thời lượng người dùng chọn => kéo dài các điểm (vui chơi, cà phê trước) trong khoảng cho phép
const stretchExtras = (stops, durationLimit, extras) => {
  let slack = durationLimit - stopsMinutes(stops);
  if (slack < STRETCH.MIN_SLACK_MINUTES) return null;
  const next = { ...extras };
  for (const role of STRETCH.ROLE_PRIORITY) {
    for (const stop of stops.filter((item) => item.role === role && !item.stay_locked)) {
      const add = Math.min(slack, stop.stay_range.max - stop.stay_minutes);
      if (add <= 0) continue;
      next[String(stop.place.id)] = (next[String(stop.place.id)] ?? 0) + add;
      slack -= add;
    }
  }
  return slack < durationLimit - stopsMinutes(stops) ? next : null;
};

const STRETCH_ROUNDS = 2; // kéo dài điểm trước giờ ăn làm giảm thời gian chờ => có thể cần thêm 1 lượt

/**
 * Dựng lịch trình từ danh sách địa điểm ĐÃ có thứ tự: giờ đến, cách di chuyển từng chặng, chi phí
 * và bảng TỔNG HỢP (summary) — thời gian, quãng đường, ngân sách, so với giới hạn người dùng đặt.
 * Dùng chung cho gợi ý lộ trình, xem trước và khi lưu => số liệu luôn do server tính, không tin client.
 * `stayOverrides` { placeId: phút } = thời gian người dùng tự chỉnh; `fillDuration` = kéo dài cho vừa thời lượng đã chọn.
 */
export const buildPlan = (orderedPlaces, planInput, { targetMeals = [], stayOverrides = {} } = {}) => {
  const { people, startTime, tripBudget = null, durationHours = null, fillDuration = false } = planInput;
  const durationLimit = durationHours ? durationHours * MINUTES_PER_HOUR : null;
  let extras = {};
  let built = buildStops(orderedPlaces, planInput, { targetMeals, stayOverrides, stayExtras: extras });
  for (let round = 0; fillDuration && durationLimit && round < STRETCH_ROUNDS; round += 1) {
    const next = stretchExtras(built.stops, durationLimit, extras);
    if (!next) break;
    const stretched = buildStops(orderedPlaces, planInput, { targetMeals, stayOverrides, stayExtras: next });
    if (stopsMinutes(stretched.stops) > durationLimit) break; // kéo dài làm lệch giờ ăn => vượt thời lượng: giữ bản trước
    extras = next;
    built = stretched;
  }
  const { stops, endTime: clock } = built;

  const sum = (pick) => stops.reduce((total, stop) => total + pick(stop), 0);
  const travelMinutes = sum((stop) => stop.travel_minutes);
  const visitMinutes = sum((stop) => stop.stay_minutes);
  const freeMinutes = sum((stop) => stop.free_minutes_before);
  const placesCost = sum((stop) => stop.est_cost);
  const transportCost = sum((stop) => stop.travel.cost_per_person);
  const costPerPerson = placesCost + transportCost;
  const rated = orderedPlaces.filter((place) => place.rating > 0);

  const summary = {
    stop_count: stops.length,
    people,
    start_time: startTime,
    end_time: clock,
    total_minutes: travelMinutes + visitMinutes + freeMinutes,
    travel_minutes: travelMinutes,
    visit_minutes: visitMinutes,
    free_minutes: freeMinutes,
    total_distance_km: roundTo(sum((stop) => stop.distance_km)),
    places_cost_per_person: placesCost,
    transport_cost_per_person: transportCost,
    cost_per_person: costPerPerson,
    total_cost: costPerPerson * people,
    trip_budget: tripBudget,
    budget_left: tripBudget == null ? null : tripBudget - costPerPerson,
    within_budget: tripBudget == null || costPerPerson <= tripBudget,
    duration_limit_minutes: durationLimit,
    time_left_minutes: durationLimit == null ? null : durationLimit - (travelMinutes + visitMinutes + freeMinutes),
    within_duration: durationLimit == null || travelMinutes + visitMinutes + freeMinutes <= durationLimit,
    avg_rating: rated.length ? roundTo(rated.reduce((total, place) => total + place.rating, 0) / rated.length) : null,
    all_open: stops.every((stop) => stop.open_on_arrival), // false => có điểm đóng cửa lúc bạn tới
    unknown_hours_stops: orderedPlaces.filter((place) => place.hours_known === false).length, // nên kiểm tra giờ trước khi đi
    maybe_closed_stops: orderedPlaces.filter((place) => place.status && place.status !== PLACE_STATUS.ACTIVE).length, // có người báo đóng cửa
    estimated_price_stops: orderedPlaces.filter((place) => place.price_estimated).length, // giá là ước tính theo loại hình
    transport: summarizeTransport(stops),
    issues: [], // cảnh báo của bộ kiểm tra lộ trình (itineraryValidator) — điền sau
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
  // Người dùng tự chọn thời lượng => kéo dài các điểm cho vừa; thời lượng do hệ thống tự ước lượng => không kéo
  fillDuration: criteria.fill_duration !== false,
});

const MAX_REPAIR_ROUNDS = 3;
const REPLACEMENT_PRICE_FACTOR = 1.5; // điểm thay thế không được đắt hơn quá 1.5 lần điểm cũ (+20k)
const REPLACEMENT_PRICE_SLACK = 20000;

/**
 * Dựng lịch trình theo ĐÚNG thứ tự đã chọn; nếu có điểm ĐÓNG CỬA lúc tới nơi thì thay bằng điểm CÙNG VAI TRÒ tốt nhất đang mở
 * vào giờ đó (tối đa 3 vòng). Điểm người dùng tự chọn không bao giờ bị thay.
 */
const planWithOpenStops = (ordered, { planInput, ranked, lockedIds, targetMeals }) => {
  let chosen = ordered;
  let plan = buildPlan(chosen, planInput, { targetMeals });

  for (let round = 0; round < MAX_REPAIR_ROUNDS && !plan.summary.all_open; round += 1) {
    const usedIds = new Set(chosen.map((place) => String(place._id)));
    let replaced = false;
    plan.stops.filter((stop) => !stop.open_on_arrival && !lockedIds.has(String(stop.place.id))).forEach((stop) => {
      const substitute = ranked.find(
        (place) =>
          place.role === stop.role &&
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
    plan = buildPlan(chosen, planInput, { targetMeals });
  }
  return plan;
};

const MAX_VALIDATION_FIXES = 2;

/**
 * Kiểm tra lộ trình theo luật ăn uống. Điểm hệ thống tự chọn vi phạm (VD bữa tối tới quá sớm, sát bữa trưa)
 * => bỏ điểm đó, dựng lại, kiểm tra lại. Còn vi phạm sau 2 lần => trả null (loại phương án). Cảnh báo nhẹ => summary.issues.
 */
const validateAndFix = (plan, { places, targetMeals, planInput, lockedIds, foodTour }) => {
  let current = { plan, places, targetMeals };
  for (let round = 0; round <= MAX_VALIDATION_FIXES; round += 1) {
    const { hard, soft } = validatePlanStops(current.plan.stops, { lockedIds, foodTour });
    if (!hard.length) {
      current.plan.summary.issues = soft.map((issue) => issue.message);
      return current.plan;
    }
    const drop = new Set(hard.map((issue) => issue.place_id));
    const keep = current.places.map((place, index) => ({ place, meal: current.targetMeals[index] })).filter(({ place }) => !drop.has(String(place._id)));
    if (!keep.length) return null;
    const nextPlaces = keep.map((item) => item.place);
    const nextMeals = keep.map((item) => item.meal);
    current = { plan: buildPlan(nextPlaces, planInput, { targetMeals: nextMeals }), places: nextPlaces, targetMeals: nextMeals };
  }
  return null;
};

const OPEN_CHECK_STEP_MINUTES = 30;

// Địa điểm có mở cửa vào ít nhất 1 thời điểm trong suốt chuyến đi không? (kiểm tra mỗi 30 phút)
const isOpenDuringTrip = (place, startTime, durationHours) => {
  const steps = Math.ceil((durationHours * MINUTES_PER_HOUR) / OPEN_CHECK_STEP_MINUTES);
  return Array.from({ length: steps }, (_, index) => addMinutesToTime(startTime, index * OPEN_CHECK_STEP_MINUTES)).some((time) =>
    isOpenAt(place.opening_hours, time),
  );
};

// Ăn chay: điểm ăn (bữa chính / ăn vặt loại "food") chỉ lấy quán chay; khu vực không có quán chay thì giữ nguyên
const VEGETARIAN_NAME = /\b(chay|vegan|vegetarian|thuan chay)\b/;
const applyDiet = (candidates, diet) => {
  if (diet !== 'chay') return;
  const isFoodStop = (place) => place.category === 'food';
  const isVegetarian = (place) => VEGETARIAN_NAME.test(normalizeSearchText(`${place.name} ${(place.cuisines ?? []).join(' ')}`));
  if (!candidates.some((place) => isFoodStop(place) && isVegetarian(place))) return;
  const kept = candidates.filter((place) => !isFoodStop(place) || isVegetarian(place));
  candidates.splice(0, candidates.length, ...kept);
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
// `excludeIds`: nơi người dùng không muốn đi (AI Planner: "bỏ quán X", "đừng đưa vào Bùi Viện").
export const suggestItineraries = async (criteria, mustIncludeIds = [], { excludeIds = [] } = {}) => {
  const origin = [criteria.origin.lng, criteria.origin.lat];
  const mustIncludeRaw = await getPlacesByIds(mustIncludeIds);
  const mustInclude = mustIncludeRaw.map((place) => ({ ...place, distance_m: haversineKm(origin, place.location.coordinates) * 1000 }));

  // 1. Khuôn: chuỗi vị trí theo vai trò, đúng giờ ăn + thứ tự người dùng muốn
  const slots = composeSlots({ criteria, mustInclude });
  const roles = new Set(slots.map((slot) => slot.role));
  const categories = [...new Set([...roles].flatMap((role) => slotCategories(role, criteria.categories)))];

  // 2. Ứng viên cho các loại hình cần dùng (bỏ nơi đóng cửa suốt chuyến, nơi người dùng loại ra)
  const [nearby, inVenue] = await Promise.all([
    findCandidatePlaces({ ...toPlaceFilters(criteria), categories }),
    criteria.venue_id ? findPlacesInVenue(criteria.venue_id) : [], // chuyến đi mall: đủ quán / rạp bên trong mall đó
  ]);
  const found = [...new Map([...nearby, ...inVenue.map((place) => ({ ...place, distance_m: haversineKm(origin, place.location.coordinates) * 1000 }))].map((place) => [String(place._id), place])).values()];
  const excluded = new Set(excludeIds.map(String));
  const candidates = found
    .filter((place) => !excluded.has(String(place._id)) && isOpenDuringTrip(place, criteria.start_time, criteria.duration_hours))
    .map((place) => ({ ...place, role: getVisitRole(place) }));
  applyDiet(candidates, criteria.diet);
  if (candidates.length + mustInclude.length === 0) {
    throw new AppError('Không có địa điểm nào khớp bộ lọc. Hãy nới bán kính hoặc bỏ bớt điều kiện.', HTTP_STATUS.UNPROCESSABLE_ENTITY, EXPLORE_ERROR_CODES.NO_MATCHING_PLACES);
  }

  const score = buildScorer([...candidates, ...mustInclude], { tags: criteria.tags, radiusKm: criteria.radius_km });
  const planInput = toPlanInput(criteria);
  const lockedIds = new Set(mustInclude.map((place) => String(place._id)));
  const fillOptions = { score, tripBudget: criteria.trip_budget ?? null, userCategories: criteria.categories, origin, radiusKm: criteria.radius_km, venueId: criteria.venue_id ?? null };

  // 3. Mỗi chiến lược lấp khuôn theo trọng số riêng => tối đa 3 phương án khác nhau; phương án vi phạm luật ăn uống bị loại
  const seen = new Set();
  const options = [];
  for (const strategy of STRATEGIES) {
    const ranked = rankCandidates(candidates, strategy, score);
    const { chosen: stops, targetMeals } = fillSlots(slots, ranked, { ...fillOptions, strategy });
    const signature = stops.map((place) => String(place._id)).join(',');
    if (!stops.length || seen.has(signature)) continue; // 2 chiến lược ra cùng lộ trình => bỏ bản trùng
    seen.add(signature);

    const repaired = planWithOpenStops(stops, { planInput, ranked, lockedIds, targetMeals });
    const repairedPlaces = repaired.place_ids.map((id) => [...stops, ...ranked].find((place) => String(place._id) === String(id)));
    const plan = validateAndFix(repaired, { places: repairedPlaces, targetMeals, planInput, lockedIds, foodTour: Boolean(criteria.food_tour) });
    if (!plan) continue;
    const finalSignature = plan.place_ids.map(String).join(',');
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
  if (options.length === 0) {
    throw new AppError('Không ghép được lộ trình hợp lý với các điều kiện này. Hãy nới ngân sách, bán kính hoặc thời lượng.', HTTP_STATUS.UNPROCESSABLE_ENTITY, EXPLORE_ERROR_CODES.NO_MATCHING_PLACES);
  }

  // Người dùng đã tự chọn đủ điểm => không còn gì để "tiết kiệm" hay "gần nhất": gọi đúng tên là lộ trình của họ.
  if (options.length === 1 && options[0].place_ids.every((id) => lockedIds.has(String(id)))) {
    Object.assign(options[0], {
      key: 'custom', label: 'Theo lựa chọn của bạn', emoji: '🧭',
      description: 'Giữ đúng các điểm bạn đã chọn, sắp xếp cho hợp giờ',
      suggested_name: `Chuyến đi ${options[0].stops.length} điểm của tôi`,
    });
  }

  return { criteria, candidate_count: candidates.length, slots: slots.map(({ role, meal, estimated_time: time }) => ({ role, meal, time })), options };
};

// POST /api/itineraries/preview — tổng hợp nhanh cho đúng các điểm người dùng đang chọn (sắp lại cho thuận đường + hợp giờ ăn).
// keepOrder = giữ đúng thứ tự (VD người dùng đang chỉnh ±15′ 1 lộ trình đã gợi ý); stayOverrides = thời gian tự chỉnh.
export const previewItinerary = async (criteria, placeIds, { keepOrder = false, stayOverrides = {} } = {}) => {
  const places = await getPlacesByIds(placeIds);
  const planInput = toPlanInput(criteria);
  const ordered = keepOrder ? places : orderStops([criteria.origin.lng, criteria.origin.lat], places, planInput);
  const plan = buildPlan(ordered, planInput, { stayOverrides });
  // Người dùng tự chọn => không loại, nhưng báo mọi vấn đề (VD 2 bữa chính liền nhau)
  const { hard, soft } = validatePlanStops(plan.stops, { foodTour: Boolean(criteria.food_tour) });
  plan.summary.issues = [...hard, ...soft].map((issue) => issue.message);
  return plan;
};
