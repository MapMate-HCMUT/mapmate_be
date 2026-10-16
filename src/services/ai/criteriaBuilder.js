// Agent 2 — Chuẩn hoá & neo vào dữ liệu thật (không dùng LLM).
// Output của Agent 1 (có thể sai / thiếu) -> "tiêu chí chuyến đi" hợp lệ cho bộ lên lộ trình (tripCriteriaSchema):
// kẹp giá trị vào giới hạn, đổi "tối nay" thành giờ cụ thể, tìm địa danh người dùng nhắc trong DB, chọn quán cho món
// người dùng muốn ăn. Mọi giá trị tự điền đều ghi vào `assumptions` để hiển thị cho người dùng (minh bạch).
import { AI_INTENTS, AI_MAX_MUST_VISIT, AI_PLACE_LOOKUP_RADIUS_KM, AI_PLACE_ROLES } from '../../constants/ai.js';
import { APP_TIMEZONE_OFFSET_HOURS } from '../../constants/gamification.js';
import { DEFAULT_ORIGIN, DURATION_FILTER, PEOPLE_FILTER, TRIP_BUDGET_FILTER } from '../../constants/places.js';
import { DEFAULT_VEHICLE } from '../../constants/transport.js';
import { tripCriteriaSchema } from '../../middlewares/validators/itinerary.validator.js';
import { normalizeDistrict } from '../../utils/district.js';
import { formatVnd } from '../../utils/money.js';
import { normalizeSearchText } from '../../utils/text.js';
import { findNearestMall, getDistrictCenter, getPlacesByIds, lookupPlacesByText } from '../place.service.js';
import { composeSlots, estimateDurationHours, hasExplicitShape, preferredStartForMeals } from '../tripComposer.js';
import { MEAL_WINDOWS } from '../../constants/tripRules.js';
import { MALL_TRIP_WORDS } from '../../constants/venues.js';
import { getVisitRole } from '../../utils/visitRole.js';
import { isMall, mallBrandOf } from '../../utils/venue.js';

const MINUTES_PER_HOUR = 60;
const HALF_HOUR = 30;
const DAY_START_HOUR = 6;
const DAY_END_HOUR = 21;
const DEFAULT_START = '09:00';
const TONIGHT_START = '18:30';
const DISTRICT_RADIUS_KM = 4;
const NEAR_RADIUS_KM = 3;
const MAX_KEYWORD_STOPS = 2;
const REFINE_CHEAPER_FACTOR = 0.7;
// "rẻ / vừa / sang" => giới hạn giá mỗi điểm (đ/người)
const PRICE_LEVEL_LIMITS = { cheap: { price_max: 150000 }, moderate: { price_max: 400000 }, upscale: { price_min: 200000 } };
// Món -> loại hình để tìm quán đúng loại ("trà sữa" là cà phê, không phải quán ăn)
export const KEYWORD_CATEGORY = {
  'trà sữa': ['cafe'],
  kem: ['cafe'],
  chè: ['cafe', 'food'],
  rooftop: ['entertainment', 'food', 'cafe'],
  acoustic: ['entertainment', 'cafe'],
  'bảo tàng': ['attraction'],
  chùa: ['attraction'],
  'nhà thờ': ['attraction'],
  'công viên': ['park'],
  'sở thú': ['park'],
  chợ: ['shopping'],
  bia: ['entertainment', 'food'],
  bar: ['entertainment'],
  karaoke: ['entertainment'],
  'xem phim': ['entertainment'],
  phim: ['entertainment'],
};
// Từ khoá mô tả KIỂU nơi chốn (không phải tên món / tên quán) => đổi thành loại hình + phong cách để chấm điểm,
// không dùng làm chữ tìm kiếm (tìm "hoàng hôn" theo tên thì gần như không quán nào khớp)
const VIBE_KEYWORDS = [
  { pattern: /(hoàng hôn|ngắm cảnh|view|cảnh đẹp|ngắm thành phố|bình minh)/, categories: ['attraction', 'park'], tags: ['ngoai-troi', 'song-ao'] },
  { pattern: /(sống ảo|chụp ảnh|chụp hình|check.?in)/, categories: [], tags: ['song-ao'] },
  { pattern: /(yên tĩnh|làm việc|học bài|đọc sách)/, categories: ['cafe'], tags: ['yen-tinh'] },
  { pattern: /(lãng mạn|hẹn hò)/, categories: [], tags: ['hen-ho'] },
];
const vibeOf = (keyword) => VIBE_KEYWORDS.find((vibe) => vibe.pattern.test(keyword.toLowerCase())) ?? null;

// Từ chung chung (tên bữa, loại hình) — đã thể hiện qua meals / categories, không phải món cụ thể để tìm quán
const GENERIC_KEYWORDS = new Set(['ăn', 'ăn uống', 'ăn trưa', 'ăn tối', 'ăn sáng', 'ăn khuya', 'bữa trưa', 'bữa tối', 'bữa sáng', 'bữa chính', 'bữa ăn', 'ăn vặt', 'tráng miệng', 'food tour', 'quán ăn', 'nhà hàng', 'đồ ăn', 'uống', 'đồ uống', 'cà phê', 'cafe', 'coffee', 'đi chơi', 'vui chơi', 'tham quan', 'giải trí', 'mua sắm', 'check-in', 'hẹn hò']);
const DEFAULT_KEYWORD_CATEGORIES = ['food'];

const pad = (value) => String(value).padStart(2, '0');
const minutesOf = (time) => Number(time.slice(0, 2)) * MINUTES_PER_HOUR + Number(time.slice(3, 5));
const MEAL_STAY_MINUTES = 60;

// Giờ Việt Nam hiện tại (server có thể chạy ở múi giờ khác)
export const vietnamNow = (date = new Date()) => {
  const local = new Date(date.getTime() + APP_TIMEZONE_OFFSET_HOURS * MINUTES_PER_HOUR * 60 * 1000);
  return {
    hours: local.getUTCHours(),
    minutes: local.getUTCMinutes(),
    date: local.toISOString().slice(0, 10), // "YYYY-MM-DD" theo giờ Việt Nam
    weekday: local.getUTCDay(), // 0 = Chủ nhật
    label: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())} ngày ${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()}`,
  };
};

const DAY_MS = 24 * MINUTES_PER_HOUR * 60 * 1000;
const SATURDAY = 6;
const HINT_HOURS = { tonight: 19, tomorrow: 9, weekend: 9 };
const addDays = (isoDate, days) => new Date(Date.parse(isoDate) + days * DAY_MS).toISOString().slice(0, 10);

// Ngày + giờ (giờ Việt Nam) của chuyến đi / câu hỏi — để tra dự báo thời tiết
export const tripMoment = ({ date_hint: hint, start_time: startTime }, now = vietnamNow()) => {
  const daysAhead = { tomorrow: 1, weekend: now.weekday === 0 || now.weekday === SATURDAY ? 0 : SATURDAY - now.weekday }[hint] ?? 0;
  const hour = startTime ? Number(startTime.slice(0, 2)) : HINT_HOURS[hint] ?? now.hours;
  return { date: addDays(now.date, daysAhead), hour };
};

const nextHalfHour = ({ hours, minutes }) => {
  const total = Math.ceil((hours * MINUTES_PER_HOUR + minutes + 1) / HALF_HOUR) * HALF_HOUR;
  return `${pad(Math.floor(total / MINUTES_PER_HOUR) % 24)}:${pad(total % MINUTES_PER_HOUR)}`;
};

const SAME_DAY_HINTS = ['now', 'today', 'tonight'];

const resolveStartTime = (interpreted, base, now, notes) => {
  const soon = nextHalfHour(now);
  // "ăn trưa rồi cà phê" không nói giờ => bắt đầu sao cho tới bữa trưa đúng giờ ăn
  const mealStart = !interpreted.start_time && preferredStartForMeals(interpreted.meals, interpreted.sequence);
  if (mealStart) {
    const sameDay = SAME_DAY_HINTS.includes(interpreted.date_hint);
    const start = sameDay && mealStart < soon ? soon : mealStart;
    notes.push(`Đi lúc ${start} để kịp ${MEAL_WINDOWS[interpreted.meals[0]].label}`);
    return start;
  }
  if (interpreted.start_time) {
    // "chiều nay" mà đã 15:10 => không thể bắt đầu 14:30, dời sang mốc gần nhất
    if (SAME_DAY_HINTS.includes(interpreted.date_hint) && interpreted.start_time < soon) return soon;
    return interpreted.start_time;
  }
  const isDaytime = now.hours >= DAY_START_HOUR && now.hours < DAY_END_HOUR;
  switch (interpreted.date_hint) {
    case 'now':
    case 'today':
      return soon;
    case 'tonight':
      return soon > TONIGHT_START ? soon : TONIGHT_START;
    case 'tomorrow':
    case 'weekend':
      notes.push(`Chưa nói giờ — tạm bắt đầu lúc ${base?.start_time ?? DEFAULT_START}`);
      return base?.start_time ?? DEFAULT_START;
    default:
      if (base?.start_time) return base.start_time;
      notes.push(`Chưa nói giờ — tạm bắt đầu lúc ${isDaytime ? soon : DEFAULT_START}`);
      return isDaytime ? soon : DEFAULT_START;
  }
};

const resolveBudget = (interpreted, base, people, isRefine, notes) => {
  let perPerson = interpreted.budget_per_person ?? (interpreted.budget_total ? Math.round(interpreted.budget_total / people) : null);
  if (interpreted.budget_total && !interpreted.budget_per_person) notes.push(`Tổng ${formatVnd(interpreted.budget_total)} cho ${people} người ≈ ${formatVnd(perPerson)}/người`);
  if (perPerson == null && isRefine && interpreted.price_level === 'cheap' && base?.trip_budget) {
    perPerson = Math.round(base.trip_budget * REFINE_CHEAPER_FACTOR);
    notes.push(`"Rẻ hơn" — giảm ngân sách xuống ~${formatVnd(perPerson)}/người`);
  }
  if (perPerson == null) return base?.trip_budget ?? null;
  if (perPerson < TRIP_BUDGET_FILTER.min) {
    notes.push(`Ngân sách tối thiểu là ${formatVnd(TRIP_BUDGET_FILTER.min)}/người`);
    return TRIP_BUDGET_FILTER.min;
  }
  if (perPerson > TRIP_BUDGET_FILTER.max) {
    notes.push(`Ngân sách trên ${formatVnd(TRIP_BUDGET_FILTER.max)}/người — không giới hạn chi phí`);
    return null;
  }
  return perPerson;
};

const clamp = (value, { min, max }) => Math.min(max, Math.max(min, value));
const uniq = (items) => [...new Set(items)];

// Tìm địa danh người dùng nhắc => toạ độ / id thật. Không thấy => ghi chú, bỏ qua (không bịa).
// Model đôi khi coi từ chung là địa danh ("đi mall" => places_mentioned "mall") — tra tên sẽ ra nhầm "Saigon Mall"
const GENERIC_PLACE_NAMES = new Set(['mall', 'shopping mall', 'trung tam thuong mai', 'tttm', 'trung tam mua sam', 'trung tam', 'sieu thi']);

const resolveMentions = async (mentions, near, notes) => {
  const resolved = { origin: null, near: null, mustVisit: [], avoid: [] };
  for (const mention of mentions) {
    if (GENERIC_PLACE_NAMES.has(normalizeSearchText(mention.name))) continue; // "mall" không phải tên 1 nơi cụ thể
    const [place] = await lookupPlacesByText(mention.name, { near, radiusKm: AI_PLACE_LOOKUP_RADIUS_KM, preferLandmarks: true });
    if (!place) {
      notes.push(`Không tìm thấy "${mention.name}" trong dữ liệu MapMate`);
      continue;
    }
    if (mention.role === AI_PLACE_ROLES.ORIGIN) resolved.origin ??= place;
    else if (mention.role === AI_PLACE_ROLES.NEAR) resolved.near ??= place;
    else if (mention.role === AI_PLACE_ROLES.AVOID) resolved.avoid.push(place);
    else resolved.mustVisit.push(place);
  }
  return resolved;
};

// Chưa nói thời lượng: chuyến có "hình dạng" rõ (thứ tự, số điểm, food tour, chỉ ăn uống) => ước lượng theo khuôn,
// còn lại => mặc định. Luôn ghi chú để người dùng biết.
const autoDuration = (draft, notes, intent) => {
  let hours = DURATION_FILTER.default;
  if (hasExplicitShape(draft)) {
    const slots = composeSlots({ criteria: { ...draft, duration_hours: DURATION_FILTER.default } });
    hours = clamp(estimateDurationHours(slots), DURATION_FILTER);
  }
  // Có bữa muộn hơn (ăn trưa ... rồi ăn tối) => chuyến phải kéo tới hết bữa đó, không thì bữa tối bị cắt mất
  const lastMeal = [...(draft.meals ?? [])].map((meal) => MEAL_WINDOWS[meal]).filter(Boolean).sort((a, b) => b.preferred.localeCompare(a.preferred))[0];
  if (lastMeal && draft.start_time && lastMeal.preferred > draft.start_time) {
    const untilMealEnds = (minutesOf(lastMeal.preferred) + MEAL_STAY_MINUTES - minutesOf(draft.start_time)) / MINUTES_PER_HOUR;
    hours = clamp(Math.max(hours, Math.ceil(untilMealEnds)), DURATION_FILTER);
  }
  if (intent !== AI_INTENTS.FIND_PLACES) notes.push(`Chưa nói thời lượng — dự kiến khoảng ${hours} giờ`);
  return hours;
};

// "mall", "shopping mall", "trung tâm thương mại" — từ khoá của chuyến đi mall, không phải món để tìm quán
const isMallTripWord = (keyword) => MALL_TRIP_WORDS.test(keyword.trim().toLowerCase());

// Chuyến đi mall ("đi Vincom chơi", "đi mall"): chọn 1 mall (người dùng nói tên, hoặc mall gần nhất có quán bên trong),
// ưu tiên quán ăn / cà phê / rạp NẰM TRONG mall đó, và đủ loại hình để có bữa ăn + đồ uống chứ không chỉ "mua sắm".
const MALL_TRIP_CATEGORIES = ['shopping', 'food', 'cafe', 'entertainment'];
const VENUE_KEYWORD_RADIUS_KM = 0.3; // "xem phim" trong chuyến đi Vincom => tìm rạp trong Vincom trước
const resolveTripMall = async ({ criteria, mustVisit, interpretation, notes }) => {
  const asked = interpretation.criteria.keywords.some(isMallTripWord) || interpretation.places_mentioned.some((mention) => mallBrandOf(mention.name));
  // Mall người dùng gọi tên — hoặc mall chứa quán người dùng gọi tên ("ăn Dookki ở Vincom")
  const named = mustVisit.find(isMall);
  const parentId = !named && asked ? mustVisit.find((place) => place.parent_place_id)?.parent_place_id : null;
  let mall = named ?? (parentId ? (await getPlacesByIds([parentId]).catch(() => []))[0] : null);
  if (!mall && !asked) return null;
  mall ??= await findNearestMall([criteria.origin.lng, criteria.origin.lat], criteria.radius_km);
  if (!mall) {
    notes.push(`Không có trung tâm thương mại nào trong ${criteria.radius_km} km`);
    return null;
  }
  criteria.venue_id = String(mall._id);
  if (criteria.categories.every((category) => category === 'shopping')) criteria.categories = MALL_TRIP_CATEGORIES;
  notes.push(`Chuyến đi trong ${mall.name} — ưu tiên quán ăn, cà phê, rạp phim bên trong`);
  return mall;
};

// ── Điền chỗ trống từ ghi nhớ ──
const VEHICLE_NAMES = { bike: 'xe máy', car: 'ô tô', walk: 'đi bộ', public: 'xe buýt / metro' };
const rememberedVehicle = (remembered, notes) => {
  if (!remembered?.vehicle) return null;
  notes.push(`${MEMORY_NOTE_PREFIX} bạn thường đi ${VEHICLE_NAMES[remembered.vehicle] ?? remembered.vehicle}`);
  return remembered.vehicle;
};
const rememberedBudget = (remembered, intent, notes) => {
  if (!remembered?.budget_per_person || intent === AI_INTENTS.FIND_PLACES) return null;
  notes.push(`${MEMORY_NOTE_PREFIX} ngân sách thường khoảng ${formatVnd(remembered.budget_per_person)}/người`);
  return remembered.budget_per_person;
};
// Ăn chay (đã ghi nhớ) chỉ là SỞ THÍCH: các điểm ăn (nếu có) chọn quán chay (criteria.diet) — KHÔNG tự thêm 1 quán chay
// bắt buộc vào chuyến không hề nhắc tới ăn uống (lỗi cũ: hỏi chỗ ngắm hoàng hôn lại bị ép ghé quán lẩu chay).
// Riêng "tìm quán ăn" thì dùng "chay" làm từ khoá tìm kiếm.
const wantsFood = (interpreted) => interpreted.categories.includes('food') || interpreted.meals.length > 0 || interpreted.food_tour || interpreted.sequence.some((role) => role === 'meal' || role === 'snack');
const withDietKeyword = (interpreted, remembered, notes, intent) => {
  if (remembered?.diet !== 'chay' || interpreted.keywords.some((keyword) => /chay/i.test(keyword)) || !wantsFood(interpreted)) return interpreted.keywords;
  notes.push(`${MEMORY_NOTE_PREFIX} bạn ăn chay — ưu tiên quán chay`);
  return intent === AI_INTENTS.FIND_PLACES ? ['chay', ...interpreted.keywords] : interpreted.keywords;
};

// "Về trước 22h": giờ đi phải trước giờ về; thời lượng không vượt quá khoảng còn lại
const MIN_TRIP_MINUTES = 60;
const resolveEndBy = ({ endBy, startTime, durationHours, base, now, notes }) => {
  if (!endBy) return { startTime, durationHours };
  let start = startTime;
  // Model / luật hiểu nhầm giờ về thành giờ đi (start ≥ giờ về) => lấy giờ đi cũ hoặc mốc gần nhất
  if (minutesOf(start) >= minutesOf(endBy)) {
    const fallback = base?.start_time && minutesOf(base.start_time) < minutesOf(endBy) ? base.start_time : nextHalfHour(now);
    if (minutesOf(fallback) >= minutesOf(endBy)) return { startTime, durationHours, tooLate: true };
    start = fallback;
  }
  const available = minutesOf(endBy) - minutesOf(start);
  // Làm tròn LÊN: 18:30 → 22:00 là 3,5 giờ => 4 giờ (làm tròn xuống thì lộ trình đúng giờ vẫn bị báo "dài hơn thời lượng");
  // giờ về chính xác theo phút do Agent kiểm tra canh
  const hours = Math.max(1, Math.min(durationHours, Math.ceil(available / MINUTES_PER_HOUR)));
  if (available < MIN_TRIP_MINUTES) notes.push(`Chỉ còn ${available} phút từ ${start} tới ${endBy} — lộ trình sẽ rất ngắn`);
  else if (hours < durationHours) notes.push(`Về trước ${endBy} — rút còn khoảng ${hours} giờ (bắt đầu ${start})`);
  return { startTime: start, durationHours: hours };
};

const STICKY_FIELDS = ['origin', 'people', 'vehicle'];
const pickSticky = (criteria) => (criteria ? Object.fromEntries(STICKY_FIELDS.filter((key) => criteria[key] != null).map((key) => [key, criteria[key]])) : null);

const toOrigin = (place) => ({ lng: place.location.coordinates[0], lat: place.location.coordinates[1], label: place.name });

/**
 * @param {{ interpretation, previousCriteria, previousMustVisitIds, clientOrigin, now }} input
 * @returns {{ criteria, mustInclude: Place[], exclude: Place[], keywordPlaces: Place[], assumptions: string[] }}
 */
// Giá trị lấy từ ghi nhớ của người dùng luôn được ghi chú bằng tiền tố này (giao diện + bộ điều phối nhận ra)
export const MEMORY_NOTE_PREFIX = 'Theo ghi nhớ:';

export const buildCriteria = async ({ interpretation, previousCriteria = null, previousMustVisitIds = [], clientOrigin: rawClientOrigin = null, now = vietnamNow(), memory = null }) => {
  // Sở thích đã ghi nhớ chỉ dùng để ĐIỀN CHỖ TRỐNG (người dùng nói gì thì theo đó), và luôn ghi chú cho người dùng thấy
  const remembered = memory?.enabled ? memory.facts : null;
  const clientOrigin = rawClientOrigin && { ...rawClientOrigin, label: rawClientOrigin.label || 'Vị trí của bạn' };
  const { intent, criteria: interpreted, places_mentioned: mentions } = interpretation;
  const isRefine = intent === AI_INTENTS.REFINE_TRIP && Boolean(previousCriteria);
  // Sửa lộ trình => giữ toàn bộ tiêu chí cũ. Chuyến mới trong cùng cuộc trò chuyện => chỉ nhớ "thông tin về người dùng".
  const base = isRefine ? previousCriteria : pickSticky(previousCriteria);
  const notes = [];

  // 1. Điểm xuất phát: địa danh người dùng nói > tâm quận > vị trí trình duyệt > lần trước > trung tâm Quận 1
  const district = normalizeDistrict(interpreted.district);
  const districtCenter = district ? await getDistrictCenter(district) : null;
  const searchFrom = clientOrigin ?? base?.origin ?? DEFAULT_ORIGIN;
  const mentioned = await resolveMentions(mentions, [searchFrom.lng, searchFrom.lat], notes);
  let origin;
  if (mentioned.origin) origin = toOrigin(mentioned.origin);
  else if (mentioned.near) origin = { ...toOrigin(mentioned.near), label: `Quanh ${mentioned.near.name}` };
  else if (districtCenter) origin = { ...districtCenter, label: `Trung tâm ${district}` };
  else if (mentioned.mustVisit.length && !clientOrigin) {
    // "Đi Suối Tiên rồi ăn lẩu" => tìm các điểm khác quanh Suối Tiên, không phải quanh trung tâm thành phố
    origin = { ...toOrigin(mentioned.mustVisit[0]), label: `Quanh ${mentioned.mustVisit[0].name}` };
    notes.push(`Tìm các điểm khác quanh ${mentioned.mustVisit[0].name}`);
  }
  else if (clientOrigin) origin = clientOrigin;
  else if (base?.origin) origin = base.origin;
  else {
    origin = { ...DEFAULT_ORIGIN, label: 'Trung tâm Quận 1' };
    notes.push('Chưa biết bạn ở đâu — tạm xuất phát từ trung tâm Quận 1 (bấm "Vị trí của tôi" để đổi)');
  }
  if (district && !districtCenter) notes.push(`Chưa có dữ liệu cho "${interpreted.district}"`);

  // 2. Thông số chuyến đi
  const people = interpreted.people ?? base?.people ?? remembered?.people ?? PEOPLE_FILTER.default;
  if (!interpreted.people && !base?.people) notes.push(remembered?.people ? `${MEMORY_NOTE_PREFIX} bạn thường đi ${people} người` : `Chưa nói số người — tính cho ${people} người`);
  const shape = {
    sequence: interpreted.sequence.length ? interpreted.sequence : isRefine ? base.sequence ?? [] : [],
    meals: interpreted.meals.length ? interpreted.meals : isRefine ? base.meals ?? [] : [],
    food_tour: interpreted.food_tour || (isRefine && Boolean(base.food_tour)),
    stop_count: interpreted.stop_count ?? (isRefine ? base.stop_count ?? null : null),
  };
  const vibes = interpreted.keywords.map(vibeOf).filter(Boolean);
  const vibeCategories = vibes.flatMap((vibe) => vibe.categories);
  const categories = uniq([...(isRefine ? [...(base.categories ?? []), ...interpreted.categories] : interpreted.categories), ...vibeCategories]);
  const endBy = interpreted.end_by ?? (isRefine ? base.end_by ?? null : null);
  const rawStart = resolveStartTime(interpreted, base, now, notes);
  const rawDuration = interpreted.duration_hours ?? (isRefine ? base.duration_hours : null) ?? autoDuration({ ...shape, categories, start_time: rawStart }, notes, intent);
  const { startTime, durationHours } = resolveEndBy({ endBy, startTime: rawStart, durationHours: clamp(rawDuration, DURATION_FILTER), base, now, notes });
  const priceLimits = PRICE_LEVEL_LIMITS[interpreted.price_level] ?? {};
  const radiusKm = interpreted.radius_km ?? (mentioned.near ? NEAR_RADIUS_KM : districtCenter ? DISTRICT_RADIUS_KM : base?.radius_km);
  const liveTrip = ['now', 'today', 'tonight'].includes(interpreted.date_hint);

  const criteria = tripCriteriaSchema.parse({
    origin,
    categories,
    tags: uniq([...(isRefine ? [...(base.tags ?? []), ...interpreted.tags] : interpreted.tags), ...vibes.flatMap((vibe) => vibe.tags)]).slice(0, 12),
    price_min: priceLimits.price_min ?? (isRefine ? base.price_min : 0),
    price_max: priceLimits.price_max ?? (isRefine ? base.price_max ?? null : null),
    trip_budget: resolveBudget(interpreted, base, people, isRefine, notes) ?? rememberedBudget(remembered, intent, notes),
    people: clamp(people, PEOPLE_FILTER),
    vehicle: interpreted.vehicle ?? base?.vehicle ?? rememberedVehicle(remembered, notes) ?? DEFAULT_VEHICLE,
    transport_modes: [],
    ...(radiusKm ? { radius_km: radiusKm } : {}),
    min_rating: interpreted.min_rating ?? (isRefine ? base.min_rating ?? null : null),
    start_time: startTime,
    end_by: endBy,
    duration_hours: clamp(durationHours, DURATION_FILTER),
    open_only: interpreted.open_only ?? (liveTrip || (isRefine && Boolean(base.open_only))),
    ...shape,
    diet: remembered?.diet === 'chay' || (isRefine && base.diet === 'chay') || interpreted.keywords.some((keyword) => /chay/i.test(keyword)) ? 'chay' : null,
    fill_duration: interpreted.duration_hours != null || (isRefine && base.fill_duration === true), // chỉ kéo dài cho đủ giờ khi người dùng nói thời lượng
    district: null, // lọc theo vòng bán kính quanh tâm quận thay vì ranh giới cứng (quán sát ranh vẫn được tính)
    prefer_district: districtCenter ? district : isRefine ? base.prefer_district ?? null : null, // ...nhưng ưu tiên quán trong đúng quận
  });

  // 3. Chuyến đi mall => chọn mall trước để món / rạp người dùng nhắc được tìm TRONG mall đó
  const mall = await resolveTripMall({ criteria, mustVisit: mentioned.mustVisit, interpretation, notes });

  // 4. Món cụ thể ("ốc", "lẩu") => chọn 1 quán tốt nhất gần điểm xuất phát (hoặc trong mall) làm điểm bắt buộc
  const keywordPlaces = [];
  const keywords = withDietKeyword(interpretation.criteria, remembered, notes, intent).filter((keyword) => !GENERIC_KEYWORDS.has(keyword.trim().toLowerCase()) && !isMallTripWord(keyword) && !vibeOf(keyword));
  // Người dùng đã gọi tên quán ("ăn Haidilao") => không tìm thêm quán cho từ khoá cùng vai trò ("lẩu") — tránh 2 bữa lẩu
  const namedRoles = new Set(mentioned.mustVisit.map(getVisitRole));
  for (const keyword of keywords.slice(0, MAX_KEYWORD_STOPS)) {
    const categories = KEYWORD_CATEGORY[keyword.toLowerCase()] ?? DEFAULT_KEYWORD_CATEGORIES;
    const [inMall] = mall ? await lookupPlacesByText(keyword, { near: mall.location.coordinates, radiusKm: VENUE_KEYWORD_RADIUS_KM, categories }) : [];
    const [place] = inMall ? [inMall] : await lookupPlacesByText(keyword, { near: [criteria.origin.lng, criteria.origin.lat], radiusKm: criteria.radius_km, categories });
    if (place && namedRoles.has(getVisitRole(place))) continue;
    if (place) keywordPlaces.push(place);
    else notes.push(`Chưa tìm thấy chỗ có "${keyword}" trong ${criteria.radius_km} km`);
  }

  // Sửa lộ trình ("thêm trà sữa") => giữ các điểm bắt buộc của lượt trước (quán ốc đã chọn), trừ khi người dùng bảo bỏ
  const keptFromBefore = isRefine && previousMustVisitIds.length ? await getPlacesByIds(previousMustVisitIds).catch(() => []) : [];
  const excludeIds = new Set(mentioned.avoid.map((place) => String(place._id)));
  const mustInclude = [...(mall ? [mall] : []), ...keptFromBefore, ...mentioned.mustVisit, ...keywordPlaces]
    .filter((place, index, list) => !excludeIds.has(String(place._id)) && list.findIndex((other) => String(other._id) === String(place._id)) === index)
    .slice(0, AI_MAX_MUST_VISIT);

  return { criteria, mustInclude, exclude: mentioned.avoid, keywordPlaces, mentionedMustVisit: mentioned.mustVisit, searchKeywords: keywords, assumptions: notes };
};
