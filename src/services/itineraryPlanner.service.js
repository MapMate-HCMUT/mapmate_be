import { PLACE_STATUS } from '../constants/places.js';
import { DAYTIME_ONLY, LEISURE_SHOP_NAME, MEAL_RULES, NOT_LEISURE_NAME, STRETCH, VISIT_ROLES } from '../constants/tripRules.js';
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
import { activityGroupOf, activityTypeOf } from '../utils/activityType.js';
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
const LEG_DISTANCE_WEIGHT = 0.6;
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
// Người dùng nói 1 quận ("food tour Quận 4") => vòng tìm quanh tâm quận vẫn chạm quận bên cạnh: ưu tiên điểm trong đúng quận
const PREFER_DISTRICT_BONUS = 0.3;

// Giờ dùng để XẾP lộ trình: chùa, nhà thờ, bảo tàng... chưa rõ giờ => coi như chỉ mở ban ngày
const isDaytimeOnly = (place) => DAYTIME_ONLY.KINDS.includes(place.kind) || (place.category === 'attraction' && DAYTIME_ONLY.NAME.test(place.name ?? ''));
const planHours = (place) => ((place.opening_hours?.open && place.opening_hours?.close) || !isDaytimeOnly(place) ? place.opening_hours : DAYTIME_ONLY.HOURS);
const isOpenForPlan = (place, time) => isOpenAt(planHours(place), time);

// Điểm hệ thống được TỰ chọn cho 1 chuyến đi chơi: bỏ sân tập, coworking, cửa hàng chưa rõ loại (điện máy, ô tô...).
// Người dùng gọi tên thì vẫn đi (điểm bắt buộc không qua bộ lọc này).
const isCasualPick = (place) => !NOT_LEISURE_NAME.test(place.name ?? '') && (place.category !== 'shopping' || Boolean(place.kind) || LEISURE_SHOP_NAME.test(place.name ?? ''));

// Nơi nguồn dữ liệu chưa có điểm nhưng người dùng MapMate đã chấm => dùng điểm cộng đồng
const effectiveRating = (place) => (place.review_count > 0 || place.rating > 0 ? place.rating : place.community_rating?.average ?? 0);
const isUnrated = (place) => !(effectiveRating(place) > 0);

const avgPrice = (place) => (place.price_range.min + place.price_range.max) / 2;

/**
 * Mỗi chiến lược là 1 bộ trọng số trên 4 tiêu chí đã chuẩn hoá về 0–1 => từ cùng 1 bộ lọc ra nhiều lộ trình khác nhau.
 * Thêm chiến lược mới (VD "ít ngập nhất", "AI gợi ý") chỉ cần thêm 1 phần tử vào đây.
 */
// ── Đa dạng gợi ý: mỗi lần hỏi ra lộ trình khác, mỗi lộ trình phối nhiều kiểu chơi (bắn cung + mall + cà phê...) ──
const DIVERSITY = {
  POOL_SIZE: 8, // mỗi vị trí bốc thăm trong 8 ứng viên tốt nhất (không phải luôn lấy hạng 1)
  TEMPERATURE: 0.12, // độ "ngẫu hứng": ứng viên kém hạng 1 cỡ 0.12 điểm vẫn có ~1/3 cơ hội của hạng 1
  SAME_TYPE_PENALTY: 0.4, // điểm vui chơi cùng kiểu với 1 điểm đã có trong lộ trình (2 rạp phim, 2 bảo tàng...)
  SAME_GROUP_PENALTY: 0.25, // khác kiểu nhưng cùng nhóm (nhà thờ rồi bưu điện = cùng "tham quan") => ưu tiên đổi nhóm (tham quan + bắn cung + mall)
  OTHER_OPTION_PENALTY: 0.25, // đã nằm trong phương án khác của lần gợi ý này => 3 phương án khác hẳn nhau
  RECENT_PENALTY: 0.6, // vừa gợi ý ở lượt trước trong cùng cuộc trò chuyện
};

// Chọn ngẫu nhiên có trọng số (softmax theo điểm) trong nhóm ứng viên tốt nhất
const pickWeighted = (items, scoreOf, random) => {
  const pool = items.map((item) => ({ item, score: scoreOf(item) })).sort((a, b) => b.score - a.score).slice(0, DIVERSITY.POOL_SIZE);
  const weights = pool.map(({ score }) => Math.exp((score - pool[0].score) / DIVERSITY.TEMPERATURE));
  let ticket = random() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    ticket -= weights[index];
    if (ticket <= 0) return pool[index].item;
  }
  return pool.at(-1).item;
};

const shuffle = (items, random) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
};

const STRATEGIES = [
  {
    key: 'budget', label: 'Tiết kiệm nhất', emoji: '💸',
    description: 'Ưu tiên địa điểm giá mềm mà vẫn được đánh giá tốt',
    weights: { price: 0.6, rating: 0.2, popularity: 0.05, proximity: 0.15 },
  },
  {
    key: 'top_rated', label: 'Đánh giá cao', emoji: '⭐',
    description: 'Ưu tiên nơi được đánh giá tốt — không nhất thiết là chỗ đông nhất',
    weights: { price: 0.05, rating: 0.65, popularity: 0.1, proximity: 0.2 },
  },
  {
    key: 'hidden_gem', label: 'Lạ & mới', emoji: '🧭',
    description: 'Những chỗ hay nhưng ít người biết — đổi gió so với các điểm quen thuộc',
    // Trừ điểm độ nổi tiếng: nơi ít lượt nhận xét mà vẫn được đánh giá tốt sẽ lên đầu
    weights: { price: 0.15, rating: 0.4, popularity: -0.25, proximity: 0.2 },
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
const buildScorer = (candidates, { tags, radiusKm, preferDistrict = null }) => {
  const maxPrice = Math.max(1, ...candidates.map(avgPrice));
  const maxReviewLog = Math.max(1, ...candidates.map((place) => Math.log10(1 + (place.review_count ?? 0))));
  const tagSet = new Set(tags);

  const features = (place) => ({
    price: 1 - avgPrice(place) / maxPrice,
    rating: isUnrated(place) ? UNRATED_RATING_SCORE : Math.max(0, (effectiveRating(place) - MIN_RATING_SCALE) / (MAX_RATING - MIN_RATING_SCALE)),
    popularity: Math.log10(1 + (place.review_count ?? 0)) / maxReviewLog,
    proximity: Math.max(0, 1 - place.distance_m / 1000 / radiusKm),
    style: tagSet.size ? (place.tags ?? []).filter((tag) => tagSet.has(tag)).length / tagSet.size : 0,
  });

  return (place, weights) => {
    const feature = features(place);
    const penalty = (place.hours_known === false ? UNKNOWN_HOURS_PENALTY : 0) + (place.status === PLACE_STATUS.MAYBE_CLOSED ? MAYBE_CLOSED_PENALTY : 0);
    const districtBonus = preferDistrict && place.district === preferDistrict ? PREFER_DISTRICT_BONUS : 0;
    return Object.entries(weights).reduce((sum, [key, weight]) => sum + feature[key] * weight, feature.style * STYLE_WEIGHT + districtBonus - penalty);
  };
};

const rankCandidates = (candidates, strategy, score) =>
  [...candidates].sort((a, b) => score(b, strategy.weights) - score(a, strategy.weights));

/**
 * Lấp quán thật vào từng vị trí của khuôn (tripComposer): đúng vai trò + loại hình, vừa phần ngân sách của vị trí đó,
 * ưu tiên điểm tốt theo chiến lược VÀ gần điểm trước. Giữ nguyên thứ tự khuôn (không sắp lại) => đúng giờ ăn, đúng ý người dùng.
 */
const fillSlots = (slots, ranked, { strategy, score, tripBudget, userCategories, origin, radiusKm, venueId = null, random, avoidIds, otherOptionIds }) => {
  const chosen = [];
  // Kiểu hoạt động đã có trong lộ trình (kể cả điểm người dùng tự chọn) => điểm vui chơi tiếp theo nên khác kiểu
  const fixedActivities = slots.filter((slot) => slot.fixed && slot.role === VISIT_ROLES.ACTIVITY).map((slot) => slot.fixed);
  const usedTypes = new Set(fixedActivities.map(activityTypeOf));
  const usedGroups = new Set(fixedActivities.map(activityGroupOf));
  const varietyPenalty = (place) => {
    if (usedTypes.has(activityTypeOf(place))) return DIVERSITY.SAME_TYPE_PENALTY;
    return usedGroups.has(activityGroupOf(place)) ? DIVERSITY.SAME_GROUP_PENALTY : 0;
  };
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
    const diversityPenalty = (place) =>
      (slot.role === VISIT_ROLES.ACTIVITY ? varietyPenalty(place) : 0) +
      (otherOptionIds.has(String(place._id)) ? DIVERSITY.OTHER_OPTION_PENALTY : 0) +
      (avoidIds.has(String(place._id)) ? DIVERSITY.RECENT_PENALTY : 0);
    const legScore = (place) =>
      score(place, strategy.weights) + venueBonus(place) - diversityPenalty(place) - LEG_DISTANCE_WEIGHT * Math.min(1, haversineKm(previous, place.location.coordinates) / radiusKm);
    const pick = pickWeighted(matches, legScore, random);
    if (slot.role === VISIT_ROLES.ACTIVITY) {
      usedTypes.add(activityTypeOf(pick));
      usedGroups.add(activityGroupOf(pick));
    }
    chosen.push(pick);
    targetMeals.push(slot.meal);
    usedIds.add(String(pick._id));
    spent += avgPrice(pick);
    previous = pick.location.coordinates;
    previousPlace = pick;
  });
  return { chosen, targetMeals };
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
const buildStops = (orderedPlaces, { origin, modes, startTime, people, foodTour = false }, { targetMeals, stayOverrides, stayExtras }) => {
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
    const needed = waitBeforeStop(role, reachedAt, { ...lastAt, targetMeal: targetMeals[index], foodTour });
    const previous = stops.at(-1);
    // Ở lại điểm trước lâu hơn để chờ giờ ăn: vui chơi tối đa +45′, quán khác tối đa +30′ so với bình thường
    const extendLimit = previous?.role === VISIT_ROLES.ACTIVITY
      ? previous.stay_typical + MEAL_RULES.MAX_EXTEND_ACTIVITY_MINUTES
      : Math.min(previous?.stay_range.max ?? 0, (previous?.stay_typical ?? 0) + STRETCH.MAX_EXTRA_MINUTES);
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
      open_on_arrival: isOpenForPlan(place, arrival),
      travel: { mode: travel.mode, label: travel.label, emoji: travel.emoji, cost_per_person: travel.costPerPerson, segments: travel.segments },
    });
  });
  return { stops, endTime: clock };
};

const stopsMinutes = (stops) => stops.reduce((total, stop) => total + stop.travel_minutes + stop.stay_minutes + stop.free_minutes_before, 0);

// Lộ trình ngắn hơn thời lượng người dùng chọn => kéo dài các điểm (vui chơi, cà phê trước) trong khoảng cho phép,
// mỗi điểm tối đa +30′ so với bình thường — còn dư thì về sớm, không "giết thời gian" của người dùng
const stretchExtras = (stops, durationLimit, extras) => {
  let slack = durationLimit - stopsMinutes(stops);
  if (slack < STRETCH.MIN_SLACK_MINUTES) return null;
  const next = { ...extras };
  for (const role of STRETCH.ROLE_PRIORITY) {
    for (const stop of stops.filter((item) => item.role === role && !item.stay_locked)) {
      const add = Math.min(slack, stop.stay_range.max - stop.stay_minutes, stop.stay_typical + STRETCH.MAX_EXTRA_MINUTES - stop.stay_minutes);
      if (add <= 0) continue;
      next[String(stop.place.id)] = (next[String(stop.place.id)] ?? 0) + add;
      slack -= add;
    }
  }
  return slack < durationLimit - stopsMinutes(stops) ? next : null;
};

// Mỗi bữa chính rơi vào bữa nào trong ngày ("lunch,dinner") — để biết kéo dài có làm lệch giờ ăn không
const mealSlots = (stops) => stops.filter((stop) => stop.role === VISIT_ROLES.MEAL).map((stop) => mealAt(stop.arrival_time)).join(',');

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
    if (mealSlots(stretched.stops) !== mealSlots(built.stops)) break; // kéo dài đẩy bữa trưa ra khỏi giờ trưa => giữ bản trước
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
  foodTour: Boolean(criteria.food_tour), // food tour: ăn vặt liền tay, không bắt chờ giữa 2 quán
});

// ── Sắp thứ tự đi cho đỡ chạy vòng ──
// Khuôn (tripComposer) quyết định đi LÀM GÌ; thứ tự thì thử mọi hoán vị (≤ 6 điểm; nhiều hơn => đổi chỗ từng cặp tới khi
// hết cải thiện) và chọn cách tốn ít phút di chuyển + chờ nhất mà vẫn đúng luật ăn uống, đúng giờ mở cửa.
const EXHAUSTIVE_ORDER_MAX_STOPS = 6;
const MAX_SWAP_ROUNDS = 4;
const ORDER_PENALTY = { closed: 120, hard: 1000, soft: 30, drinkFirst: 10, mealMoved: 60 };

const permutations = (items) =>
  items.length <= 1 ? [items] : items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest]));

const orderCost = (items, planInput, { lockedIds, foodTour }) => {
  const { stops, summary } = buildPlan(items.map((item) => item.place), { ...planInput, fillDuration: false }, { targetMeals: items.map((item) => item.meal) });
  const { hard, soft } = validatePlanStops(stops, { lockedIds, foodTour });
  const closed = stops.filter((stop) => !stop.open_on_arrival).length;
  const drinkFirst = stops.length > 1 && stops[0].role === VISIT_ROLES.DRINK; // không mở đầu chuyến bằng ly cà phê khi còn lựa chọn khác
  // Ngồi lâu hơn bình thường chỉ để chờ giờ ăn cũng là thời gian chết, như chờ không
  const idle = summary.free_minutes + stops.reduce((sum, stop) => sum + Math.max(0, stop.stay_minutes - stop.stay_typical), 0);
  // Bữa trưa dự định mà bị dời sang tối (vì quán đó chỉ mở tối) => thà đổi quán khác còn hơn bỏ bữa trưa
  const mealMoved = items.filter((item, index) => item.meal && stops[index].role === VISIT_ROLES.MEAL && mealAt(stops[index].arrival_time) !== item.meal).length;
  return summary.travel_minutes + idle + closed * ORDER_PENALTY.closed + hard.length * ORDER_PENALTY.hard + soft.length * ORDER_PENALTY.soft
    + (drinkFirst ? ORDER_PENALTY.drinkFirst : 0) + mealMoved * ORDER_PENALTY.mealMoved;
};

/**
 * @param {Place[]} places @param {Array<string|null>} targetMeals — bữa dự định của từng điểm (đi kèm điểm khi đổi chỗ)
 * @returns {{ places: Place[], targetMeals: Array<string|null> }}
 */
export const optimizeOrder = (places, targetMeals, planInput, { lockedIds = new Set(), foodTour = false } = {}) => {
  const items = places.map((place, index) => ({ place, meal: targetMeals[index] ?? null }));
  const cost = (order) => orderCost(order, planInput, { lockedIds, foodTour });
  let best = items;
  let bestCost = cost(items);
  if (items.length <= EXHAUSTIVE_ORDER_MAX_STOPS) {
    permutations(items).forEach((order) => {
      const value = cost(order);
      if (value < bestCost) [best, bestCost] = [order, value];
    });
  } else {
    for (let round = 0, improved = true; improved && round < MAX_SWAP_ROUNDS; round += 1) {
      improved = false;
      for (let i = 0; i < best.length - 1; i += 1) {
        for (let j = i + 1; j < best.length; j += 1) {
          const order = [...best];
          [order[i], order[j]] = [order[j], order[i]];
          const value = cost(order);
          if (value < bestCost) [best, bestCost, improved] = [order, value, true];
        }
      }
    }
  }
  return { places: best.map((item) => item.place), targetMeals: best.map((item) => item.meal) };
};

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
          isOpenForPlan(place, stop.arrival_time) &&
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

const DURATION_TOLERANCE_MINUTES = 30;
const MIN_TRIMMED_STOPS = 2;

// Dài quá thời lượng (> 30′) => bỏ bớt điểm hệ thống tự chọn (điểm vui chơi / đồ uống sau cùng trước, giữ bữa ăn),
// thay vì bắt người dùng đi tới khuya
const trimToDuration = ({ plan, places, targetMeals }, { planInput, lockedIds }) => {
  let current = { plan, places, targetMeals };
  const limit = plan.summary.duration_limit_minutes;
  const removable = (stops) => {
    const candidates = stops.map((stop, index) => ({ stop, index })).filter(({ stop }) => !lockedIds.has(String(stop.place.id)));
    return (candidates.findLast(({ stop }) => stop.role !== VISIT_ROLES.MEAL) ?? candidates.at(-1))?.index ?? -1;
  };
  while (limit && current.plan.summary.total_minutes > limit + DURATION_TOLERANCE_MINUTES && current.places.length > MIN_TRIMMED_STOPS) {
    const drop = removable(current.plan.stops);
    if (drop === -1) break;
    const nextPlaces = current.places.filter((_, index) => index !== drop);
    const nextMeals = current.targetMeals.filter((_, index) => index !== drop);
    current = { plan: buildPlan(nextPlaces, planInput, { targetMeals: nextMeals }), places: nextPlaces, targetMeals: nextMeals };
  }
  return current;
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
    isOpenForPlan(place, time),
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
// `avoidIds`: nơi vừa gợi ý ở lượt trước => hạn chế lặp lại. Mỗi lần gọi bốc thăm lại => lộ trình khác nhau (`random` để test).
export const suggestItineraries = async (criteria, mustIncludeIds = [], { excludeIds = [], avoidIds = [], random = Math.random } = {}) => {
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
    .filter((place) => !excluded.has(String(place._id)) && isCasualPick(place) && isOpenDuringTrip(place, criteria.start_time, criteria.duration_hours))
    .map((place) => ({ ...place, role: getVisitRole(place) }));
  applyDiet(candidates, criteria.diet);
  if (candidates.length + mustInclude.length === 0) {
    throw new AppError('Không có địa điểm nào khớp bộ lọc. Hãy nới bán kính hoặc bỏ bớt điều kiện.', HTTP_STATUS.UNPROCESSABLE_ENTITY, EXPLORE_ERROR_CODES.NO_MATCHING_PLACES);
  }

  const score = buildScorer([...candidates, ...mustInclude], { tags: criteria.tags, radiusKm: criteria.radius_km, preferDistrict: criteria.prefer_district ?? null });
  const planInput = toPlanInput(criteria);
  const lockedIds = new Set(mustInclude.map((place) => String(place._id)));
  const otherOptionIds = new Set();
  const fillOptions = {
    score, tripBudget: criteria.trip_budget ?? null, userCategories: criteria.categories, origin, radiusKm: criteria.radius_km, venueId: criteria.venue_id ?? null,
    random, avoidIds: new Set(avoidIds.map(String)), otherOptionIds,
  };

  // 3. Mỗi chiến lược lấp khuôn theo trọng số riêng => tối đa 3 phương án khác nhau; phương án vi phạm luật ăn uống bị loại
  const seen = new Set();
  const options = [];
  // Thứ tự chiến lược đổi mỗi lần (luôn có "Lạ & mới" trong 3 phương án đầu)
  const others = shuffle(STRATEGIES.filter((item) => item.key !== 'hidden_gem'), random);
  const strategyOrder = [...others.slice(0, 2), STRATEGIES.find((item) => item.key === 'hidden_gem'), ...others.slice(2)];
  for (const strategy of strategyOrder) {
    const ranked = rankCandidates(candidates, strategy, score);
    const filled = fillSlots(slots, ranked, { ...fillOptions, strategy });
    // Người dùng nói rõ thứ tự ("ăn trưa rồi cà phê") => giữ nguyên; còn lại sắp lại cho đỡ chạy vòng
    const { places: stops, targetMeals } = criteria.sequence?.length
      ? { places: filled.chosen, targetMeals: filled.targetMeals }
      : optimizeOrder(filled.chosen, filled.targetMeals, planInput, { lockedIds, foodTour: Boolean(criteria.food_tour) });
    const signature = stops.map((place) => String(place._id)).join(',');
    if (!stops.length || seen.has(signature)) continue; // 2 chiến lược ra cùng lộ trình => bỏ bản trùng
    seen.add(signature);

    const repaired = planWithOpenStops(stops, { planInput, ranked, lockedIds, targetMeals });
    const repairedPlaces = repaired.place_ids.map((id) => [...stops, ...ranked].find((place) => String(place._id) === String(id)));
    const trimmed = trimToDuration({ plan: repaired, places: repairedPlaces, targetMeals }, { planInput, lockedIds });
    const plan = validateAndFix(trimmed.plan, { places: trimmed.places, targetMeals: trimmed.targetMeals, planInput, lockedIds, foodTour: Boolean(criteria.food_tour) });
    if (!plan) continue;
    const finalSignature = plan.place_ids.map(String).join(',');
    if (finalSignature !== signature && seen.has(finalSignature)) continue;
    seen.add(finalSignature);
    plan.place_ids.forEach((id) => otherOptionIds.add(String(id)));
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
  const ordered = keepOrder ? places : optimizeOrder(places, [], planInput, { lockedIds: new Set(placeIds.map(String)), foodTour: Boolean(criteria.food_tour) }).places;
  const plan = buildPlan(ordered, planInput, { stayOverrides });
  // Người dùng tự chọn => không loại, nhưng báo mọi vấn đề (VD 2 bữa chính liền nhau)
  const { hard, soft } = validatePlanStops(plan.stops, { foodTour: Boolean(criteria.food_tour) });
  plan.summary.issues = [...hard, ...soft].map((issue) => issue.message);
  return plan;
};
