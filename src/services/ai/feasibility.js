// Kiểm tra yêu cầu có làm được không TRƯỚC khi lên lộ trình — bằng số liệu, không nhờ LLM:
//   - thời gian: "8 chỗ trong 1 tiếng", "ăn trưa + ăn tối trong 2 tiếng"
//   - ngân sách: "buffet hải sản 50k", "3 điểm 20k"
// Không làm được => trả lý do kèm con số + vài phương án gần nhất (người dùng bấm để gửi tiếp).
import { KEYWORD_MIN_COST, MEAL_RULES, MEAL_WINDOWS, MIN_STOP_MINUTES, ROLE_MIN_COST, ROLE_SLOT_MINUTES, VISIT_ROLES, VISIT_ROLE_LABELS } from '../../constants/tripRules.js';
import { formatVnd } from '../../utils/money.js';
import { composeSlots } from '../tripComposer.js';

const MINUTES_PER_HOUR = 60;
const BUDGET_STEP = 50000;
const THOUSAND = 1000;
const MAX_ALTERNATIVES = 3;
const LATE_NIGHT = { from: '00:00', to: '04:59' };

const checkTime = (raw, reasons, alternatives) => {
  const hours = raw.duration_hours;
  if (!hours) return;
  const stopCount = raw.stop_count ?? (raw.sequence.length || null);
  const maxStops = Math.max(1, Math.floor((hours * MINUTES_PER_HOUR) / MIN_STOP_MINUTES));
  if (stopCount && stopCount > maxStops) {
    reasons.push(`${stopCount} điểm trong ${hours} giờ là không kịp: mỗi điểm cần ít nhất ~${MIN_STOP_MINUTES} phút kể cả đi lại, nên ${hours} giờ chỉ đủ khoảng ${maxStops} điểm.`);
    alternatives.push(`Đi ${maxStops} chỗ trong ${hours} tiếng`, `Đi ${stopCount} chỗ trong ${Math.ceil((stopCount * MIN_STOP_MINUTES) / MINUTES_PER_HOUR)} tiếng`);
  }
  const needed = MEAL_RULES.MIN_GAP_MINUTES + ROLE_SLOT_MINUTES.meal;
  if (raw.meals.length >= 2 && hours * MINUTES_PER_HOUR < needed) {
    const labels = raw.meals.map((meal) => MEAL_WINDOWS[meal].label);
    reasons.push(`Ăn cả ${labels.join(' và ')} trong ${hours} giờ không hợp lý: 2 bữa chính nên cách nhau ít nhất ${MEAL_RULES.MIN_GAP_MINUTES / MINUTES_PER_HOUR} tiếng.`);
    alternatives.push(`Chỉ ${labels[0]}`, `Đi ${Math.ceil(needed / MINUTES_PER_HOUR)} tiếng`);
  }
};

const slotMinCost = (slot, priceFloor) => {
  if (slot.fixed) return slot.fixed.price_range?.min ?? 0;
  if (slot.role === VISIT_ROLES.ACTIVITY) return ROLE_MIN_COST.activity;
  return Math.max(ROLE_MIN_COST[slot.role], priceFloor);
};

// Điểm BẮT BUỘC phải trả tiền: người dùng nói rõ thứ tự / số điểm => tất cả; còn lại => điểm đã chọn sẵn + 1 bữa chính
// (điểm phụ như tráng miệng, cà phê thì bộ lên lộ trình tự bỏ được khi thiếu tiền — không phải lý do từ chối).
const essentialSlots = (raw, slots) => {
  if (raw.sequence.length || raw.stop_count) return slots;
  const firstMeal = slots.find((slot) => !slot.fixed && slot.role === VISIT_ROLES.MEAL);
  return slots.filter((slot) => slot.fixed || slot === firstMeal);
};

const checkBudget = ({ raw, criteria, slots }, reasons, alternatives) => {
  const people = raw.people ?? criteria.people;
  const budget = raw.budget_per_person ?? (raw.budget_total ? Math.round(raw.budget_total / people) : null);
  const essential = essentialSlots(raw, slots);
  if (budget == null || !essential.length) return;
  let minCost = essential.reduce((sum, slot) => sum + slotMinCost(slot, criteria.price_min ?? 0), 0);
  // Món có giá sàn cao ("buffet", "hải sản") mà chưa tìm được quán cụ thể => thay cho 1 bữa thường
  const keyword = raw.keywords.map((word) => word.toLowerCase()).filter((word) => KEYWORD_MIN_COST[word]).sort((a, b) => KEYWORD_MIN_COST[b] - KEYWORD_MIN_COST[a])[0];
  const hasFixedMeal = essential.some((slot) => slot.fixed && slot.role === VISIT_ROLES.MEAL);
  if (keyword && !hasFixedMeal) minCost += Math.max(0, KEYWORD_MIN_COST[keyword] - ROLE_MIN_COST.meal);
  if (budget >= minCost) return;

  const fixedNames = essential.filter((slot) => slot.fixed).map((slot) => slot.fixed.name);
  const what = keyword && !hasFixedMeal
    ? `${keyword} (thường từ ${formatVnd(KEYWORD_MIN_COST[keyword])}/người)`
    : fixedNames.length
      ? fixedNames.join(', ')
      : `${essential.length} điểm (${essential.map((slot) => VISIT_ROLE_LABELS[slot.role].toLowerCase()).join(', ')})`;
  reasons.push(`Ngân sách ${formatVnd(budget)}/người chưa đủ cho ${what} — tối thiểu khoảng ${formatVnd(minCost)}/người.`);
  alternatives.push(`Ngân sách ${(Math.ceil(minCost / BUDGET_STEP) * BUDGET_STEP) / THOUSAND}k/người`);
  if (budget >= ROLE_MIN_COST.meal && essential.length > 1 && !keyword) alternatives.push('Chỉ đi 1 chỗ');
  if (budget < ROLE_MIN_COST.snack) alternatives.push('Đi dạo công viên, phố đi bộ miễn phí');
};

/**
 * @param {{ interpretation, criteria, mustInclude }} input — criteria đã chuẩn hoá (criteriaBuilder)
 * @returns {{ feasible: boolean, reasons: string[], alternatives: string[], notes: string[], criteriaPatch: object }}
 */
export const checkFeasibility = ({ interpretation, criteria, mustInclude = [] }) => {
  const raw = interpretation.criteria;
  const reasons = [];
  const alternatives = [];
  const notes = [];
  const criteriaPatch = {};
  const slots = composeSlots({ criteria, mustInclude });

  checkTime(raw, reasons, alternatives);
  checkBudget({ raw, criteria, slots }, reasons, alternatives);

  if (criteria.start_time >= LATE_NIGHT.from && criteria.start_time <= LATE_NIGHT.to) {
    notes.push('Sau nửa đêm phần lớn địa điểm đã đóng cửa — chỉ gợi ý chỗ còn mở');
    criteriaPatch.open_only = true;
  }
  return { feasible: reasons.length === 0, reasons, alternatives: [...new Set(alternatives)].slice(0, MAX_ALTERNATIVES), notes, criteriaPatch };
};
