// Kiểm tra 1 lộ trình đã dựng (giờ đến thật) theo luật ăn uống — chốt chặn cuối trước khi trả cho người dùng.
// Lỗi "hard" ở điểm hệ thống tự chọn => loại phương án đó; còn lại hiện thành cảnh báo.
import { MEAL_RULES, MEAL_WINDOWS, VISIT_ROLES } from '../constants/tripRules.js';
import { mealAt, snackGapMinutes, toMinutes } from './tripComposer.js';

export const PLAN_ISSUES = {
  MEALS_TOO_CLOSE: 'MEALS_TOO_CLOSE',
  TOO_MANY_SNACKS: 'TOO_MANY_SNACKS',
  SNACKS_TOO_CLOSE: 'SNACKS_TOO_CLOSE',
  CONSECUTIVE_DRINKS: 'CONSECUTIVE_DRINKS',
  MEAL_OUTSIDE_WINDOW: 'MEAL_OUTSIDE_WINDOW',
};
const HARD_ISSUES = new Set([PLAN_ISSUES.MEALS_TOO_CLOSE, PLAN_ISSUES.TOO_MANY_SNACKS, PLAN_ISSUES.CONSECUTIVE_DRINKS]);

/**
 * @param {Array<{ role, arrival_time, place: { id, name } }>} stops
 * @param {{ lockedIds?: Set<string>, foodTour?: boolean }} options — điểm người dùng tự chọn không tính là lỗi "hard"
 * @returns {{ hard: Array, soft: Array }}
 */
export const validatePlanStops = (stops, { lockedIds = new Set(), foodTour = false } = {}) => {
  const issues = [];
  const add = (code, stop, message) => issues.push({ code, place_id: String(stop.place.id), message, locked: lockedIds.has(String(stop.place.id)) });
  let lastMeal = null;
  let lastSnack = null;
  let snackCount = 0;

  stops.forEach((stop, index) => {
    const minutes = toMinutes(stop.arrival_time);
    const previous = stops[index - 1];
    if (stop.role === VISIT_ROLES.MEAL) {
      if (lastMeal && minutes - toMinutes(lastMeal.arrival_time) < MEAL_RULES.MIN_GAP_MINUTES) {
        add(PLAN_ISSUES.MEALS_TOO_CLOSE, stop, `${lastMeal.place.name} và ${stop.place.name} đều là bữa chính nhưng chỉ cách nhau ${minutes - toMinutes(lastMeal.arrival_time)} phút`);
      }
      if (!mealAt(stop.arrival_time)) add(PLAN_ISSUES.MEAL_OUTSIDE_WINDOW, stop, `Ăn ở ${stop.place.name} lúc ${stop.arrival_time} — ngoài giờ ăn thường (${Object.values(MEAL_WINDOWS).map((window) => `${window.from}–${window.to}`).join(', ')})`);
      lastMeal = stop;
    }
    if (stop.role === VISIT_ROLES.SNACK) {
      snackCount += 1;
      if (snackCount > (foodTour ? MEAL_RULES.MAX_SNACKS_FOOD_TOUR : MEAL_RULES.MAX_SNACKS)) add(PLAN_ISSUES.TOO_MANY_SNACKS, stop, 'Quá nhiều điểm ăn vặt trong 1 chuyến');
      if (lastSnack && minutes - toMinutes(lastSnack.arrival_time) < snackGapMinutes(foodTour)) add(PLAN_ISSUES.SNACKS_TOO_CLOSE, stop, `Hai điểm ăn vặt quá sát nhau (${lastSnack.place.name}, ${stop.place.name})`);
      lastSnack = stop;
    }
    if (stop.role === VISIT_ROLES.DRINK && previous?.role === VISIT_ROLES.DRINK) add(PLAN_ISSUES.CONSECUTIVE_DRINKS, stop, `Hai điểm đồ uống liền nhau (${previous.place.name}, ${stop.place.name})`);
  });

  return {
    hard: issues.filter((issue) => HARD_ISSUES.has(issue.code) && !issue.locked),
    soft: issues.filter((issue) => !HARD_ISSUES.has(issue.code) || issue.locked),
  };
};
