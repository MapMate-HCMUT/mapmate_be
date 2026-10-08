// Dựng "khuôn" lộ trình trước khi chọn quán: chuỗi vị trí theo vai trò (bữa chính / ăn vặt / đồ uống / vui chơi)
// đặt đúng giờ, theo luật ăn uống (constants/tripRules.js). Planner chỉ việc lấp quán thật vào từng vị trí.
//   "tìm chỗ ăn 400k"        => [bữa chính, tráng miệng]           (không phải 3 quán ăn liền nhau)
//   "ăn trưa rồi cà phê"     => [bữa chính 11:30, đồ uống]         (giữ đúng thứ tự người dùng nói)
//   "food tour Quận 4"       => [ăn vặt, ăn vặt, ăn vặt, ...]       (giãn cách ≥ 45 phút)
//   "đi chơi cả ngày"        => [vui chơi, bữa trưa, vui chơi, đồ uống, ..., bữa tối] (2 bữa cách ≥ 4 tiếng)
import { MEAL_RULES, MEAL_WINDOWS, ROLE_SLOT_MINUTES, SLOT_TRAVEL_MINUTES, VISIT_ROLES } from '../constants/tripRules.js';
import { ITINERARY_MAX_STOPS } from '../constants/social.js';
import { addMinutesToTime } from '../utils/geo.js';
import { CATEGORY_ROLES, getVisitRole } from '../utils/visitRole.js';

const MINUTES_PER_HOUR = 60;
const AVG_MINUTES_PER_STOP = 75;
const MIN_STOPS = 2;
const MAX_AUTO_STOPS = ITINERARY_MAX_STOPS; // đi cả ngày vẫn kịp bữa tối
const EARLY_START = '08:00'; // xuất phát trước giờ này mới tính bữa sáng (đi lúc 9h thường đã ăn sáng ở nhà)
const MAX_ACTIVITY_STREAK = 2;
const MEAL_REQUIRED_HOURS = 5; // đi từ 5 tiếng trở lên (qua giờ ăn) mà không có bữa nào là vô lý — kể cả khi chỉ nói "đi chơi"
const { MEAL, SNACK, DRINK, ACTIVITY } = VISIT_ROLES;

export const toMinutes = (time) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
};
const inWindow = (time, window) => time >= window.from && time <= window.to;
// Bữa nào trong ngày ứng với giờ này (null = ngoài giờ ăn)
export const mealAt = (time) => Object.keys(MEAL_WINDOWS).find((meal) => inWindow(time, MEAL_WINDOWS[meal])) ?? null;

// Vai trò người dùng muốn, suy từ loại hình đã chọn (không chọn gì = chuyến đi chơi tổng hợp)
const wantedRoles = (categories) => {
  if (!categories?.length) return new Set([MEAL, DRINK, ACTIVITY, SNACK]);
  return new Set(categories.flatMap((category) => CATEGORY_ROLES[category] ?? []));
};

// Khoảng cách tối thiểu giữa 2 điểm ăn vặt: food tour đi liền tay, chuyến thường thì giãn ra
export const snackGapMinutes = (foodTour) => (foodTour ? MEAL_RULES.MIN_SNACK_GAP_FOOD_TOUR_MINUTES : MEAL_RULES.MIN_SNACK_GAP_MINUTES);

const isFoodOnly = (categories) => categories?.length > 0 && categories.every((category) => category === 'food' || category === 'cafe');

const autoStopCount = (durationHours) =>
  Math.min(ITINERARY_MAX_STOPS, Math.max(MIN_STOPS, Math.min(MAX_AUTO_STOPS, Math.round((durationHours * MINUTES_PER_HOUR) / AVG_MINUTES_PER_STOP))));

/**
 * Mô phỏng dòng thời gian: tại mỗi vị trí chọn vai trò hợp với giờ đó.
 * Bữa chính chỉ đặt trong khung giờ ăn và cách bữa trước ≥ 4 tiếng; ăn vặt giới hạn số lượng + giãn cách; không 2 đồ uống liền nhau.
 */
const simulateRoles = ({ count, startTime, durationHours = null, wants, meals, foodTour }) => {
  const endMinutes = durationHours ? toMinutes(startTime) + durationHours * MINUTES_PER_HOUR : Infinity;
  const roles = [];
  let clock = startTime;
  let lastMealAt = null;
  let lastSnackAt = null;
  const mealSet = meals?.length ? new Set(meals) : null; // "ăn sáng + ăn tối" => chỉ 2 bữa đó
  const allowBreakfast = mealSet ? mealSet.has('breakfast') : startTime <= EARLY_START;
  const mealAllowed = (meal) => Boolean(meal) && (mealSet ? mealSet.has(meal) : meal !== 'breakfast' || allowBreakfast);
  let mealsLeft = mealSet?.size ?? Infinity;
  const maxSnacks = foodTour ? MEAL_RULES.MAX_SNACKS_FOOD_TOUR : MEAL_RULES.MAX_SNACKS;
  let snacks = 0;
  let drinks = 0;
  let activityStreak = 0; // số điểm vui chơi liền nhau gần nhất

  for (let index = 0; index < count; index += 1) {
    const previous = roles.at(-1);
    const minutesNow = toMinutes(clock);
    const mealOk = wants.has(MEAL) && !foodTour && mealsLeft > 0 && mealAllowed(mealAt(clock)) && (lastMealAt == null || minutesNow - lastMealAt >= MEAL_RULES.MIN_GAP_MINUTES);
    // food tour: ăn vặt liên tiếp được (chỉ cần giãn cách); chuyến thường: không 2 điểm ăn vặt liền nhau
    const snackOk = wants.has(SNACK) && snacks < maxSnacks && (foodTour || previous !== SNACK) && (lastSnackAt == null || minutesNow - lastSnackAt >= snackGapMinutes(foodTour));
    if (index > 0 && minutesNow >= endMinutes) break; // hết thời lượng người dùng muốn
    const drinkOk = wants.has(DRINK) && previous !== DRINK && drinks < MEAL_RULES.MAX_DRINKS;
    const activityOk = wants.has(ACTIVITY);
    // Được ghép 2 điểm vui chơi liền nhau (VD bắn cung rồi dạo mall — planner chọn 2 kiểu khác nhau), không quá 2
    const anotherActivityOk = activityOk && activityStreak < MAX_ACTIVITY_STREAK;

    let role = null;
    if (foodTour && snackOk) role = SNACK;
    else if (mealOk) role = MEAL;
    else if (activityOk && previous !== ACTIVITY) role = ACTIVITY;
    else if (anotherActivityOk && previous === ACTIVITY && index < count - 1) role = ACTIVITY; // còn ít nhất 1 điểm sau để nghỉ chân / ăn uống
    else if (drinkOk && previous) role = DRINK; // không mở đầu bằng đồ uống khi còn lựa chọn khác
    else if (snackOk && previous === MEAL) role = SNACK; // tráng miệng sau bữa chính
    else if (activityOk) role = ACTIVITY;
    else if (drinkOk) role = DRINK;
    else if (snackOk) role = SNACK;
    if (!role) break;

    roles.push(role);
    activityStreak = role === ACTIVITY ? activityStreak + 1 : 0;
    if (role === MEAL) {
      lastMealAt = minutesNow;
      mealsLeft -= 1;
    }
    if (role === DRINK) drinks += 1;
    if (role === SNACK) {
      lastSnackAt = minutesNow;
      snacks += 1;
    }
    clock = addMinutesToTime(clock, ROLE_SLOT_MINUTES[role] + SLOT_TRAVEL_MINUTES);
  }
  return roles;
};

// Khuôn khi người dùng KHÔNG nói rõ thứ tự
const deriveRoles = (criteria) => {
  const wants = wantedRoles(criteria.categories);
  const durationHours = criteria.duration_hours;
  if (durationHours >= MEAL_REQUIRED_HOURS) wants.add(MEAL);
  const count = criteria.stop_count ?? autoStopCount(durationHours);

  if (criteria.food_tour) {
    const tourWants = new Set([SNACK, ...(wants.has(DRINK) ? [DRINK] : [])]);
    return simulateRoles({ count: criteria.stop_count ?? Math.max(3, Math.min(4, count)), startTime: criteria.start_time, wants: tourWants, foodTour: true });
  }

  // Chỉ muốn ăn uống: 1 bữa chính (+ 1 tráng miệng / đồ uống nếu đủ thời gian) — không phải 3 quán ăn liền nhau
  if (isFoodOnly(criteria.categories) && !criteria.stop_count && (criteria.meals?.length ?? 1) <= 1) {
    const after = wants.has(DRINK) ? DRINK : SNACK;
    return durationHours < 2 ? [MEAL] : [MEAL, after];
  }

  const roles = simulateRoles({ count, startTime: criteria.start_time, durationHours: criteria.stop_count ? null : durationHours, wants, meals: criteria.meals });
  // Người dùng muốn ăn nhưng giờ đi rơi ngoài giờ ăn (VD "đi ăn" lúc 15:30) => vẫn phải có 1 bữa
  if (wants.has(MEAL) && criteria.categories?.includes('food') && !roles.includes(MEAL)) roles.unshift(MEAL);
  return roles.slice(0, ITINERARY_MAX_STOPS);
};

/**
 * @param {{ criteria, mustInclude: Place[] }} input
 * @returns {Array<{ role, fixed: Place|null, estimated_time, meal }>} — đúng thứ tự đi
 */
export const composeSlots = ({ criteria, mustInclude = [] }) => {
  const roles = criteria.sequence?.length ? [...criteria.sequence] : deriveRoles(criteria);
  const slots = roles.map((role) => ({ role, fixed: null }));
  // Điểm người dùng gọi tên / tự chọn: lấp vào vị trí cùng vai trò đầu tiên còn trống, không có thì thêm vị trí mới
  for (const place of mustInclude) {
    const role = getVisitRole(place);
    const slot = slots.find((item) => item.role === role && !item.fixed);
    if (slot) slot.fixed = place;
    else slots.push({ role, fixed: place });
  }
  let clock = criteria.start_time;
  return slots.slice(0, ITINERARY_MAX_STOPS).map((slot) => {
    const scheduled = { ...slot, estimated_time: clock, meal: slot.role === MEAL ? mealAt(clock) : null };
    clock = addMinutesToTime(clock, ROLE_SLOT_MINUTES[slot.role] + SLOT_TRAVEL_MINUTES);
    return scheduled;
  });
};

/**
 * Số phút cần lùi lại trước khi vào 1 điểm để hợp giờ ăn: bữa chính chờ tới đúng khung của bữa dự định (targetMeal) hoặc
 * khung giờ ăn kế tiếp, và cách bữa trước ≥ 4 tiếng; ăn vặt cách lần trước ≥ 45 phút (food tour: 20 phút). Bên gọi quyết định chờ / ở lâu hơn.
 */
export const waitBeforeStop = (role, arrivalTime, { lastMealMinutes = null, lastSnackMinutes = null, targetMeal = null, foodTour = false } = {}) => {
  const arrival = toMinutes(arrivalTime);
  let notBefore = arrival;
  if (role === MEAL) {
    const target = MEAL_WINDOWS[targetMeal];
    if (target && arrival < toMinutes(target.from)) notBefore = toMinutes(target.from); // "bữa tối" thì không ăn lúc 14:30
    else if (!mealAt(arrivalTime)) {
      const next = Object.values(MEAL_WINDOWS).map((window) => toMinutes(window.from)).filter((start) => start > arrival).sort((a, b) => a - b)[0];
      if (next != null) notBefore = next;
    }
    if (lastMealMinutes != null) notBefore = Math.max(notBefore, lastMealMinutes + MEAL_RULES.MIN_GAP_MINUTES);
  }
  if (role === SNACK && lastSnackMinutes != null) notBefore = Math.max(notBefore, lastSnackMinutes + snackGapMinutes(foodTour));
  return Math.max(0, notBefore - arrival);
};

// Thời lượng ước tính (giờ) cho 1 khuôn — khi người dùng không nói thời lượng
export const estimateDurationHours = (slots) =>
  Math.max(1, Math.ceil(slots.reduce((sum, slot) => sum + ROLE_SLOT_MINUTES[slot.role] + SLOT_TRAVEL_MINUTES, 0) / MINUTES_PER_HOUR));

// Giờ bắt đầu hợp lý khi người dùng chỉ nói bữa ("ăn trưa", "ăn tối"). Có thứ tự ("đi bảo tàng xong ăn tối")
// => lùi giờ đi lại để tới bữa đúng giờ ăn. Không sớm hơn 06:00.
const EARLIEST_START = '06:00';
export const preferredStartForMeals = (meals, sequence = []) => {
  const preferred = meals?.length ? MEAL_WINDOWS[meals[0]]?.preferred : null;
  if (!preferred) return null;
  const firstMeal = sequence.indexOf(MEAL);
  const before = firstMeal > 0 ? sequence.slice(0, firstMeal).reduce((sum, role) => sum + ROLE_SLOT_MINUTES[role] + SLOT_TRAVEL_MINUTES, 0) : 0;
  const start = addMinutesToTime(preferred, -before);
  return start < EARLIEST_START || start > preferred ? EARLIEST_START : start;
};

// Hình dạng chuyến đi do người dùng quyết định (thứ tự / số điểm / food tour / chỉ ăn uống) => tự ước lượng thời lượng
export const hasExplicitShape = (criteria) => Boolean(criteria.sequence?.length || criteria.stop_count || criteria.food_tour || isFoodOnly(criteria.categories));
