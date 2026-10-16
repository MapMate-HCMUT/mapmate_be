// Agent chỉnh sửa lộ trình — sửa 1 lộ trình CÓ SẴN thay vì lên lộ trình mới từ đầu:
//   - lộ trình gốc: phương án AI vừa gợi ý, lộ trình người dùng đã lưu, hoặc lộ trình người khác chia sẻ (công khai / bạn bè)
//   - thao tác (Agent hiểu yêu cầu trích ra): đổi / bỏ / thêm từng điểm, sắp lại thứ tự, "rẻ hơn", đổi giờ / phương tiện / số người
//   - điểm không bị nhắc tới giữ nguyên, đúng thứ tự, đúng thời gian ở lại người dùng đã chỉnh
// Không dùng LLM. Chỉ không rõ sửa điểm nào (VD lộ trình có 2 bữa chính mà nói "đổi quán ăn") => báo cho Agent điều phối hỏi lại.
import { AI_BASE_PLAN_SOURCES, AI_EDITED_OPTION_KEY, AI_EDITOR, AI_ERROR_CODES } from '../../constants/ai.js';
import { DEFAULT_ORIGIN, PLACE_STATUS } from '../../constants/places.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import { VISIT_ROLE_LABELS } from '../../constants/tripRules.js';
import Place from '../../models/Place.model.js';
import { AppError } from '../../utils/AppError.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { getVisitRole } from '../../utils/visitRole.js';
import { getItinerary } from '../itinerary.service.js';
import { validatePlanStops } from '../itineraryValidator.js';
import { buildPlan, isCasualPick, isOpenForPlan, optimizeOrder, toPlaceFilters, toPlanInput } from '../itineraryPlanner.service.js';
import { isVegetarianPlace } from '../../utils/diet.js';
import { findCandidatePlaces, lookupPlacesByText } from '../place.service.js';
import { KEYWORD_CATEGORY } from './criteriaBuilder.js';

// Điểm mới cùng vai trò với điểm cũ nằm ở loại hình nào
const ROLE_CATEGORIES = {
  meal: ['food'],
  snack: ['food', 'cafe'],
  drink: ['cafe', 'entertainment'],
  activity: ['attraction', 'park', 'entertainment', 'shopping'],
};
const METERS_PER_KM = 1000;
const avgPrice = (place) => ((place.price_range?.min ?? 0) + (place.price_range?.max ?? 0)) / 2;
const coordsOf = (place) => place.location.coordinates;

// ── Lộ trình gốc ──

/** Phương án AI vừa gợi ý => lộ trình gốc cho lượt sửa tiếp theo */
export const basePlanFromOption = (option, criteria, extra = {}) => ({
  source: AI_BASE_PLAN_SOURCES.OPTION,
  itinerary_id: null,
  name: option.suggested_name ?? option.label,
  is_mine: false,
  place_ids: option.place_ids.map(String),
  stay_overrides: Object.fromEntries(option.stops.filter((stop) => stop.stay_locked).map((stop) => [String(stop.place.id), stop.stay_minutes])),
  vehicle: criteria.vehicle,
  transport_modes: criteria.transport_modes ?? [],
  people: criteria.people,
  start_time: option.summary.start_time,
  duration_hours: Math.ceil(option.summary.total_minutes / 60),
  origin: criteria.origin,
  ...extra,
});

/** Lộ trình đã lưu (của mình) hoặc được chia sẻ (công khai / bạn bè) => lộ trình gốc. Không có quyền xem => 404 như API thường. */
export const basePlanFromItinerary = async (itineraryId, viewerId) => {
  const itinerary = await getItinerary(itineraryId, viewerId);
  const stops = itinerary.stops.filter((stop) => stop.place_id);
  if (!stops.length) throw new AppError('Lộ trình này chưa có điểm nào để chỉnh', HTTP_STATUS.UNPROCESSABLE_ENTITY, AI_ERROR_CODES.AI_BASE_PLAN_EMPTY);
  const first = stops[0].coordinates;
  return {
    source: AI_BASE_PLAN_SOURCES.ITINERARY,
    itinerary_id: String(itinerary.id),
    name: itinerary.name,
    is_mine: itinerary.is_mine,
    place_ids: stops.map((stop) => String(stop.place_id)),
    // Giữ đúng thời gian ở lại đã lưu (người dùng có thể đã chỉnh)
    stay_overrides: Object.fromEntries(stops.filter((stop) => stop.stay_minutes > 0).map((stop) => [String(stop.place_id), stop.stay_minutes])),
    vehicle: itinerary.vehicle,
    transport_modes: itinerary.transport_modes ?? [],
    people: itinerary.people,
    start_time: itinerary.start_time || null,
    duration_hours: itinerary.total_duration ? Math.ceil(itinerary.total_duration / 60) : null,
    origin: itinerary.criteria?.origin ?? (first ? { ...first, label: stops[0].place_name } : { ...DEFAULT_ORIGIN, label: 'Trung tâm Quận 1' }),
  };
};

/** Tiêu chí tương ứng của lộ trình gốc — làm "tiêu chí cũ" cho bước chuẩn hoá (lượt sửa giữ nguyên phần không nói tới) */
export const baseCriteriaOf = (basePlan, previousCriteria = null) => ({
  ...(previousCriteria ?? {}),
  origin: basePlan.origin,
  vehicle: basePlan.vehicle,
  transport_modes: basePlan.transport_modes,
  people: basePlan.people,
  ...(basePlan.start_time ? { start_time: basePlan.start_time } : {}),
  ...(basePlan.duration_hours ? { duration_hours: Math.min(12, Math.max(1, basePlan.duration_hours)) } : {}),
});

/** Địa điểm của lộ trình gốc (bỏ qua nơi đã bị xoá khỏi dữ liệu), đúng thứ tự */
export const loadBasePlaces = async (basePlan) => {
  const places = await Place.find({ _id: { $in: basePlan.place_ids } }).lean();
  const byId = new Map(places.map((place) => [String(place._id), place]));
  return basePlan.place_ids.map((id) => byId.get(String(id))).filter(Boolean);
};

/** Mô tả ngắn cho Agent hiểu yêu cầu: "1. Pizza 4P's (Bữa chính)" — để hiểu "điểm 2", "quán pizza" */
export const describeBasePlan = (basePlan, places) =>
  [`"${basePlan.name}"${basePlan.source === AI_BASE_PLAN_SOURCES.ITINERARY && !basePlan.is_mine ? ' (người khác chia sẻ)' : ''}:`, ...places.map((place, index) => `${index + 1}. ${place.name} (${VISIT_ROLE_LABELS[getVisitRole(place)] ?? place.category})`)].join('\n');

// ── Tìm điểm thay thế / điểm thêm ──
const scoreCandidate = (place, { arrival, radiusKm }) =>
  (arrival && isOpenForPlan(place, arrival) ? OPEN_BONUS : 0) + (place.rating > 0 ? place.rating / 5 : 0) + Math.min(1, Math.log10((place.review_count ?? 0) + 1) / 4) - (place.distance_m ?? 0) / (radiusKm * METERS_PER_KM);

const OPEN_BONUS = 2;
const findStopFor = async (input) => {
  const { keyword, role, criteria } = input;
  // Người ăn chay xin "lẩu" => thử "lẩu chay" trước, không có mới lấy quán lẩu thường (Agent kiểm tra sẽ cảnh báo)
  if (keyword && criteria.diet === 'chay' && (role === 'meal' || role === 'snack' || !role) && !/chay/i.test(keyword)) {
    const vegetarian = await findStopForKeyword({ ...input, keyword: `${keyword} chay` });
    if (vegetarian) return vegetarian;
  }
  return findStopForKeyword(input);
};

const findStopForKeyword = async ({ role, keyword, near, radiusKm, excludeIds, criteria, priceCap = null, arrival = null }) => {
  const categories = (keyword && KEYWORD_CATEGORY[keyword.toLowerCase()]) ?? ROLE_CATEGORIES[role] ?? null;
  const pool = keyword
    ? await lookupPlacesByText(keyword, { near, radiusKm, categories, limit: AI_EDITOR.LOOKUP_LIMIT })
    : await findCandidatePlaces({ ...toPlaceFilters({ ...criteria, origin: { lng: near[0], lat: near[1] }, radius_km: radiusKm, price_min: 0, price_max: undefined, min_rating: undefined, district: undefined, open_only: false }), categories });
  const vegetarianOnly = criteria.diet === 'chay' && (role === 'meal' || role === 'snack') && !keyword;
  const fits = pool.filter(
    (place) =>
      !excludeIds.has(String(place._id)) &&
      place.status !== PLACE_STATUS.CLOSED &&
      isCasualPick(place) &&
      (keyword || !role || getVisitRole(place) === role) &&
      (priceCap == null || avgPrice(place) <= priceCap) &&
      (!vegetarianOnly || place.category !== 'food' || isVegetarianPlace(place)),
  );
  return fits.map((place) => ({ place: { ...place, distance_m: place.distance_m ?? haversineKm(near, coordsOf(place)) * METERS_PER_KM }, score: 0 }))
    .map((item) => ({ ...item, score: scoreCandidate(item.place, { arrival, radiusKm }) }))
    .sort((a, b) => b.score - a.score)[0]?.place ?? null;
};

// Chen điểm mới vào chỗ tốn ít quãng đường nhất (không đổi thứ tự các điểm cũ)
const cheapestInsertion = (items, place, origin) => {
  const points = [origin, ...items.map((item) => coordsOf(item.place))];
  let best = { index: items.length, cost: Infinity };
  for (let index = 0; index <= items.length; index += 1) {
    const before = points[index];
    const after = points[index + 1];
    const cost = haversineKm(before, coordsOf(place)) + (after ? haversineKm(coordsOf(place), after) - haversineKm(before, after) : 0);
    if (cost < best.cost) best = { index, cost };
  }
  return best.index;
};

// ── Xác định điểm bị sửa ──
const matchesName = (place, name) => {
  const needle = normalizeSearchText(name);
  const hay = normalizeSearchText(place.name);
  return needle.length >= 2 && (hay.includes(needle) || needle.includes(hay));
};

/**
 * @returns {{ index } | { ambiguous: Array<{ index, name }> } | { missing: true }}
 */
const findTarget = (items, edit, touched) => {
  if (edit.stop_number) return items[edit.stop_number - 1] ? { index: edit.stop_number - 1 } : { missing: true };
  if (edit.target_name) {
    const index = items.findIndex((item) => matchesName(item.place, edit.target_name));
    return index >= 0 ? { index } : { missing: true };
  }
  if (edit.target_role) {
    const matches = items.map((item, index) => ({ index, name: item.place.name, role: item.role })).filter((item) => item.role === edit.target_role && !touched.has(item.index));
    if (matches.length === 1) return { index: matches[0].index };
    if (matches.length > 1) return { ambiguous: matches };
  }
  return { missing: true };
};

const describeEdit = (edit) => edit.target_name ?? (edit.stop_number ? `điểm ${edit.stop_number}` : VISIT_ROLE_LABELS[edit.target_role]?.toLowerCase() ?? 'điểm cần sửa');

/**
 * Áp các thao tác lên lộ trình gốc và dựng lại lịch trình.
 * @param {{ basePlan, places, interpretation, criteria, mentionedMustVisit?: Place[], avoid?: Place[] }} input
 * @returns {{ option?, changes: string[], unresolved: string[], ambiguous?: { edit_index, question, options }, trace }}
 */
// LLM hay tách "đổi quán ăn" (lộ trình có 2 bữa) thành 2 thao tác giống hệt => gộp lại để Agent điều phối hỏi "đổi quán nào?"
const vagueKey = (edit) => (!edit.stop_number && !edit.target_name ? `${edit.action}|${edit.target_role}|${edit.keyword}|${edit.new_role}` : null);
const dedupeVagueEdits = (edits) => edits.filter((edit, index) => !vagueKey(edit) || edits.findIndex((other) => vagueKey(other) === vagueKey(edit)) === index);

export const editPlan = async ({ basePlan, places, interpretation: rawInterpretation, criteria, mentionedMustVisit = [], avoid = [] }) => {
  const interpretation = { ...rawInterpretation, edits: dedupeVagueEdits(rawInterpretation.edits ?? []) };
  const origin = [criteria.origin.lng, criteria.origin.lat];
  // Giờ ghé từng điểm của lộ trình gốc — điểm thay thế phải ĐANG MỞ vào giờ đó
  const baseline = buildPlan(places, { ...toPlanInput(criteria), fillDuration: false }, { stayOverrides: basePlan.stay_overrides ?? {} });
  const arrivalOf = (place) => baseline.stops.find((stop) => String(stop.place.id) === String(place._id))?.arrival_time ?? null;
  const items = places.map((place) => ({ place, role: getVisitRole(place) }));
  const stayOverrides = { ...basePlan.stay_overrides };
  const changes = [];
  const unresolved = [];
  const touched = new Set();
  const usedIds = () => new Set(items.map((item) => String(item.place._id)));

  for (const [editIndex, edit] of interpretation.edits.entries()) {
    if (edit.action === 'add') {
      const role = edit.new_role ?? 'activity';
      const near = items.length ? coordsOf(items.at(-1).place) : origin;
      const place = await findStopFor({ role, keyword: edit.keyword, near, radiusKm: AI_EDITOR.ADD_RADIUS_KM, excludeIds: usedIds(), criteria });
      if (!place) {
        unresolved.push(`Chưa tìm được ${edit.keyword ? `chỗ có "${edit.keyword}"` : (VISIT_ROLE_LABELS[role] ?? 'điểm').toLowerCase()} gần lộ trình để thêm`);
        continue;
      }
      const at = cheapestInsertion(items, place, origin);
      items.splice(at, 0, { place, role: getVisitRole(place) });
      touched.add(at);
      changes.push(`Thêm ${place.name}`);
      continue;
    }
    const target = findTarget(items, edit, touched);
    if (target.ambiguous) {
      // Lộ trình có 2 bữa chính mà chỉ nói "đổi quán ăn" => hỏi lại thay vì đoán
      return {
        changes,
        unresolved,
        ambiguous: { edit_index: editIndex, question: `Bạn muốn ${edit.action === 'remove' ? 'bỏ' : 'đổi'} ${describeEdit(edit)} nào?`, options: target.ambiguous.slice(0, 4).map((item) => item.name) },
        trace: { status: 'empty', detail: { ambiguous: true } },
      };
    }
    if (target.missing) {
      unresolved.push(`Không thấy ${describeEdit(edit)} trong lộ trình`);
      continue;
    }
    const old = items[target.index];
    if (edit.action === 'remove') {
      items.splice(target.index, 1);
      delete stayOverrides[String(old.place._id)];
      changes.push(`Bỏ ${old.place.name}`);
      continue;
    }
    // replace: điểm mới cùng vai trò (hoặc vai trò người dùng nói), tìm quanh điểm cũ
    const role = edit.new_role ?? old.role;
    const place = await findStopFor({ role, keyword: edit.keyword, near: coordsOf(old.place), radiusKm: AI_EDITOR.REPLACE_RADIUS_KM, excludeIds: usedIds(), criteria, arrival: arrivalOf(old.place) });
    if (!place) {
      unresolved.push(`Chưa tìm được ${edit.keyword ? `chỗ có "${edit.keyword}"` : 'điểm thay thế'} gần ${old.place.name}`);
      continue;
    }
    items[target.index] = { place, role: getVisitRole(place) };
    touched.add(target.index);
    delete stayOverrides[String(old.place._id)];
    changes.push(`Đổi ${old.place.name} → ${place.name}`);
  }

  // Người dùng nói "bỏ quán X" / "ghé thêm Y" bằng tên (không qua edits)
  for (const place of avoid) {
    const index = items.findIndex((item) => String(item.place._id) === String(place._id));
    if (index >= 0) {
      items.splice(index, 1);
      changes.push(`Bỏ ${place.name}`);
    }
  }
  for (const place of mentionedMustVisit) {
    if (usedIds().has(String(place._id))) continue;
    items.splice(cheapestInsertion(items, place, origin), 0, { place, role: getVisitRole(place) });
    changes.push(`Thêm ${place.name}`);
  }

  // "Rẻ hơn" mà không chỉ điểm nào => đổi điểm đắt nhất sang điểm cùng vai trò rẻ hơn gần đó
  if (interpretation.criteria.price_level === 'cheap' && !interpretation.edits.length && items.length) {
    const priciest = items.reduce((best, item, index) => (avgPrice(item.place) > avgPrice(items[best].place) ? index : best), 0);
    const old = items[priciest];
    const place = await findStopFor({ role: old.role, keyword: null, near: coordsOf(old.place), radiusKm: AI_EDITOR.REPLACE_RADIUS_KM, excludeIds: usedIds(), criteria, priceCap: avgPrice(old.place) * AI_EDITOR.CHEAPER_FACTOR, arrival: arrivalOf(old.place) });
    if (place) {
      items[priciest] = { place, role: getVisitRole(place) };
      delete stayOverrides[String(old.place._id)];
      changes.push(`Đổi ${old.place.name} → ${place.name} (rẻ hơn)`);
    } else unresolved.push(`Quanh ${old.place.name} chưa có chỗ cùng kiểu rẻ hơn`);
  }

  if (!items.length) return { changes, unresolved: [...unresolved, 'Lộ trình không còn điểm nào'], trace: { status: 'empty', detail: { stops: 0 } } };

  const planInput = { ...toPlanInput(criteria), fillDuration: false };
  let ordered = items.map((item) => item.place);
  let targetMeals = items.map(() => null);
  if (interpretation.reorder) {
    const lockedIds = new Set(ordered.map((place) => String(place._id)));
    ({ places: ordered, targetMeals } = optimizeOrder(ordered, targetMeals, planInput, { lockedIds, foodTour: Boolean(criteria.food_tour) }));
    if (ordered.some((place, index) => place !== items[index].place)) changes.push('Sắp xếp lại thứ tự cho đỡ chạy vòng');
  }
  const plan = buildPlan(ordered, planInput, { targetMeals, stayOverrides });
  // Mọi điểm đều do người dùng giữ lại / yêu cầu => lỗi luật ăn uống chỉ là cảnh báo, không tự bỏ điểm
  const { hard, soft } = validatePlanStops(plan.stops, { lockedIds: new Set(ordered.map((place) => String(place._id))), foodTour: Boolean(criteria.food_tour) });
  plan.summary.issues = [...hard, ...soft].map((issue) => issue.message);

  const option = {
    key: AI_EDITED_OPTION_KEY,
    label: changes.length ? 'Lộ trình đã chỉnh' : 'Lộ trình của bạn',
    emoji: '✏️',
    description: changes.length ? changes.join(' · ') : 'Giữ nguyên các điểm, tính lại giờ theo yêu cầu mới',
    suggested_name: basePlan.name && !basePlan.name.startsWith('Lộ trình đã chỉnh') ? `${basePlan.name} (đã chỉnh)` : `Lộ trình ${plan.stops.length} điểm`,
    changes,
    ...plan,
  };
  return { option, changes, unresolved, stayOverrides, trace: { status: 'ok', detail: { changes: changes.length, unresolved: unresolved.length, stops: plan.stops.length } } };
};

/** Rút thời gian ở lại về mức tối thiểu để kịp giờ về (Agent kiểm tra gọi khi lộ trình chỉnh xong vẫn trễ) */
export const shortenStays = async (option, criteria) => {
  const places = await Place.find({ _id: { $in: option.place_ids } }).lean();
  const byId = new Map(places.map((place) => [String(place._id), place]));
  const ordered = option.place_ids.map((id) => byId.get(String(id))).filter(Boolean);
  const stayOverrides = Object.fromEntries(option.stops.map((stop) => [String(stop.place.id), stop.stay_range.min]));
  const plan = buildPlan(ordered, { ...toPlanInput(criteria), fillDuration: false }, { targetMeals: option.stops.map((stop) => stop.meal), stayOverrides });
  plan.summary.issues = option.summary.issues ?? [];
  return { ...option, ...plan, changes: [...(option.changes ?? []), 'Rút ngắn thời gian ở mỗi điểm cho kịp giờ về'] };
};
