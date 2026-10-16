// Agent kiểm tra lộ trình — chốt chặn cuối trước khi trả cho người dùng (không dùng LLM, chỉ đọc dữ liệu đã dựng):
//   giờ về ("về trước 22h"), điểm đóng cửa lúc tới, vượt ngân sách, chuyến buýt / metro cuối, chặng không có tuyến, ăn chay.
// Lỗi "hard" (trễ giờ về) => bộ điều phối sửa lại 1 vòng; sửa không được => giữ lộ trình gần nhất + hỏi người dùng muốn
// đánh đổi thế nào (bỏ 1 điểm / đi sớm hơn) thay vì âm thầm trả lộ trình sai.
import { AI_PLAN_CHECKS, AI_VERIFY } from '../../constants/ai.js';
import { MEAL_WINDOWS } from '../../constants/tripRules.js';
import { formatVnd } from '../../utils/money.js';
import { isVegetarianPlace } from '../../utils/diet.js';
import { usesPublicTransit } from '../../utils/transport.js';
import { toMinutes } from '../tripComposer.js';

const DAY_MINUTES = 24 * 60;
const NO_TRANSIT_MIN_KM = 1.5; // chặng ngắn hơn thì đi bộ / gọi xe là bình thường
const EARLIER_STEP_MINUTES = 30;
const pad = (value) => String(value).padStart(2, '0');
const clock = (minutes) => `${pad(Math.floor(((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES / 60))}:${pad(((minutes % 60) + 60) % 60)}`;

// So giờ trong 1 chuyến có thể qua nửa đêm: tính phút kể từ giờ bắt đầu
const sinceStart = (time, start) => {
  const minutes = toMinutes(time);
  return minutes < toMinutes(start) ? minutes + DAY_MINUTES : minutes;
};

/** Kiểm tra 1 lộ trình => danh sách vấn đề { code, severity: 'hard' | 'soft', message, minutes? } */
export const checkOption = (option, criteria) => {
  const { summary, stops } = option;
  const issues = [];
  const add = (code, severity, message, extra = {}) => issues.push({ code, severity, message, ...extra });

  if (criteria.end_by) {
    const late = sinceStart(summary.end_time, summary.start_time) - sinceStart(criteria.end_by, summary.start_time);
    if (late > 0) add(AI_PLAN_CHECKS.ENDS_TOO_LATE, 'hard', `Lộ trình xong lúc ${summary.end_time}, trễ ${late} phút so với giờ bạn muốn về (${criteria.end_by}).`, { minutes: late });
  }
  // Bữa người dùng nói rõ mà lộ trình không có => hard (còn phương án đủ bữa thì không đưa phương án thiếu)
  const named = (criteria.meals ?? []).filter((meal) => MEAL_WINDOWS[meal]);
  const served = new Set(stops.filter((stop) => stop.role === 'meal').map((stop) => stop.meal));
  const missing = named.filter((meal) => !served.has(meal));
  if (missing.length && stops.filter((stop) => stop.role === 'meal').length < named.length) {
    add(AI_PLAN_CHECKS.MEAL_MISSING, 'hard', `Lộ trình chưa có ${missing.map((meal) => MEAL_WINDOWS[meal].label).join(', ')} như bạn muốn.`);
  }
  const closed = stops.filter((stop) => !stop.open_on_arrival).map((stop) => stop.place.name);
  if (closed.length) add(AI_PLAN_CHECKS.CLOSED_ON_ARRIVAL, 'soft', `${closed.join(', ')} có thể chưa mở / đã đóng cửa lúc bạn tới.`);
  if (summary.within_budget === false) add(AI_PLAN_CHECKS.OVER_BUDGET, 'soft', `Vượt ngân sách khoảng ${formatVnd(-summary.budget_left)}/người.`);

  if (usesPublicTransit(criteria)) {
    const noRoute = stops.filter((stop) => stop.travel?.transit && stop.travel.transit.kind !== 'transit' && stop.distance_km >= NO_TRANSIT_MIN_KM);
    if (noRoute.length) add(AI_PLAN_CHECKS.NO_TRANSIT_ROUTE, 'soft', `Chặng tới ${noRoute.map((stop) => stop.place.name).join(', ')} không có tuyến buýt / metro phù hợp — nên gọi xe.`);
    const lastStart = sinceStart(AI_VERIFY.LAST_TRANSIT_TIME, summary.start_time);
    const late = stops.filter((stop) => (stop.travel?.transit?.departure_times ?? []).some((time) => sinceStart(time, summary.start_time) >= lastStart));
    if (late.length || sinceStart(summary.end_time, summary.start_time) >= lastStart) {
      add(AI_PLAN_CHECKS.LAST_TRANSIT, 'soft', `Sau ${AI_VERIFY.LAST_TRANSIT_TIME} xe buýt thưa, metro có thể đã nghỉ — nên tính đường về bằng xe công nghệ.`);
    }
  }
  if (criteria.diet === 'chay') {
    const meat = stops.filter((stop) => (stop.role === 'meal' || stop.role === 'snack') && stop.place.category === 'food' && !isVegetarianPlace(stop.place));
    if (meat.length) add(AI_PLAN_CHECKS.DIET_MISMATCH, 'soft', `${meat.map((stop) => stop.place.name).join(', ')} không phải quán chay — khu này chưa có quán chay phù hợp.`);
  }
  return issues;
};

/**
 * Kiểm tra mọi phương án: bỏ phương án vi phạm "hard" nếu còn phương án đạt; gắn kết quả vào option.checks.
 * @returns {{ options, failed: boolean, issues: object[] (của phương án đầu), trace }}
 */
export const verifyOptions = (options, criteria) => {
  const checked = options.map((option) => ({ ...option, checks: checkOption(option, criteria) }));
  const passing = checked.filter((option) => !option.checks.some((issue) => issue.severity === 'hard'));
  const kept = passing.length ? passing : checked;
  const issues = kept[0]?.checks ?? [];
  return {
    options: kept,
    failed: !passing.length && checked.length > 0,
    issues,
    trace: { status: passing.length || !checked.length ? 'ok' : 'empty', detail: { checked: checked.length, passed: passing.length, issues: issues.map((issue) => issue.code) } },
  };
};

/**
 * Trễ giờ về mà đã sửa hết cách => hỏi người dùng muốn đánh đổi thế nào (câu trả lời là câu bộ hiểu câu đọc được).
 * @returns {{ question, options: string[] } | null}
 */
export const tradeoffQuestion = (option, criteria) => {
  const late = option?.checks?.find((issue) => issue.code === AI_PLAN_CHECKS.ENDS_TOO_LATE);
  if (!late) return null;
  const choices = [];
  if (option.stops.length > 1) choices.push(`Bỏ điểm ${option.stops.length}`);
  const earlier = toMinutes(option.summary.start_time) - Math.ceil(late.minutes / EARLIER_STEP_MINUTES) * EARLIER_STEP_MINUTES;
  if (earlier >= 6 * 60) choices.push(`Đi sớm hơn, lúc ${clock(earlier)}`);
  choices.push(`Về trước ${clock(toMinutes(criteria.end_by) + EARLIER_STEP_MINUTES)} cũng được`);
  return { question: `Lộ trình vẫn trễ ${late.minutes} phút so với giờ bạn muốn về. Bạn chọn cách nào?`, options: choices.slice(0, 3) };
};
