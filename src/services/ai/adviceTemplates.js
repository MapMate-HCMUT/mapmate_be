// Lời tư vấn dựng theo mẫu (không dùng LLM) — dùng khi chưa có GROQ_API_KEY hoặc Groq lỗi.
// Cùng khuôn với output của Agent tư vấn (buildAdviceSchema) để giao diện không phải phân biệt.
import { AI_INTENTS } from '../../constants/ai.js';
import { MEAL_WINDOWS, VISIT_ROLE_LABELS } from '../../constants/tripRules.js';
import { formatVnd } from '../../utils/money.js';

const MINUTES_PER_HOUR = 60;
const formatMinutes = (minutes) => (minutes >= MINUTES_PER_HOUR ? `${Math.floor(minutes / MINUTES_PER_HOUR)} giờ ${minutes % MINUTES_PER_HOUR ? `${minutes % MINUTES_PER_HOUR} phút` : ''}`.trim() : `${minutes} phút`);
const TRIP_FOLLOW_UPS = ['Rẻ hơn chút', 'Gần hơn', 'Thêm quán cà phê'];
const VEHICLE_TIPS = {
  bike: 'Đi xe máy nhớ mang áo mưa — chiều tối mùa mưa ở TP.HCM hay có mưa rào.',
  car: 'Khu trung tâm khó đỗ ô tô, nên tìm bãi giữ xe trước.',
  walk: 'Đi bộ nhớ mang nước và chọn giờ mát (sáng sớm hoặc chiều tối).',
  public: 'Metro số 1 chạy khoảng 5:00–22:00; xe buýt đang miễn phí đến hết 31/12/2026.',
};

const empty = { option_notes: [], recommended_place_ids: [], tips: [], warnings: [], follow_up_suggestions: [] };

const tripWarnings = (option) => {
  const { summary } = option;
  const warnings = [];
  if (summary.within_budget === false) warnings.push(`Lộ trình "${option.label}" vượt ngân sách ${formatVnd(-summary.budget_left)}/người.`);
  if (summary.within_duration === false) warnings.push('Lộ trình dài hơn thời lượng bạn muốn.');
  if (summary.all_open === false) warnings.push('Có điểm có thể chưa mở cửa lúc bạn tới.');
  if (summary.unknown_hours_stops > 0) warnings.push(`${summary.unknown_hours_stops} điểm chưa rõ giờ mở cửa — nên gọi hỏi trước.`);
  return warnings.slice(0, 3);
};

const weatherWarning = (weather) => (weather?.rain_likely ? `Dự báo ${weather.description.toLowerCase()} lúc ${weather.time.slice(11)}, khả năng mưa ${weather.rain_probability}% — nhớ mang áo mưa.` : null);

// Hỏi lại khi yêu cầu quá chung chung (tối đa 1 lượt, ≤ 2 câu — đáp án hiện thành nút bấm)
export const buildClarifyReply = (questions) => ({
  ...empty,
  reply: `Mình cần thêm chút thông tin để gợi ý đúng ý bạn: ${questions.map((item) => item.question).join(' ')}`,
});

// Từ chối: phi thực tế (giải thích bằng con số + phương án gần nhất) hoặc không được phép
export const buildRefusalReply = ({ kind, reasons, alternatives }) => {
  if (kind === 'not_allowed') {
    const offer = alternatives.length ? ' Bạn có thể thử hỏi:' : ' Mình có thể giúp bạn tìm chỗ ăn uống, vui chơi ở TP.HCM.';
    return { ...empty, reply: `${reasons[0] ?? 'Yêu cầu này nằm ngoài những gì MapMate hỗ trợ.'}${offer}`, follow_up_suggestions: alternatives.length ? alternatives : ['Gợi ý quán cà phê yên tĩnh', 'Lên lộ trình tối nay'] };
  }
  const fallback = alternatives.length ? ` Bạn có thể chọn: ${alternatives.join(' / ')}.` : ' Bạn điều chỉnh lại ngân sách hoặc thời gian giúp mình nhé.';
  return { ...empty, reply: `Yêu cầu này khó thực hiện: ${reasons.join(' ')}${fallback}`, follow_up_suggestions: alternatives };
};

export const buildTemplateAdvice = ({ intent, criteria, assumptions = [], options = [], places = [], weather = null, refusalReason = null, retrievalError }) => {
  if (intent === AI_INTENTS.SMALLTALK) {
    return { ...empty, reply: 'Chào bạn! Mình là MapMate. Bạn muốn đi chơi ở đâu, mấy người và ngân sách khoảng bao nhiêu? Mình lên lộ trình cho.', follow_up_suggestions: ['Tối nay đi hẹn hò ở Quận 1', 'Cuối tuần cả nhà đi công viên'] };
  }
  if (intent === AI_INTENTS.OUT_OF_SCOPE) {
    return { ...empty, reply: `${refusalReason ?? 'Mình chỉ giúp được việc đi chơi, ăn uống và lên lộ trình ở TP.HCM thôi.'} Bạn muốn đi đâu ở TP.HCM không?`, follow_up_suggestions: ['Gợi ý quán cà phê yên tĩnh', 'Lên lộ trình tối nay'] };
  }

  const assumptionNote = assumptions.length ? ` Lưu ý: ${assumptions.slice(0, 2).join('; ')} — bạn sửa nếu chưa đúng nhé.` : '';
  const tips = criteria?.vehicle && VEHICLE_TIPS[criteria.vehicle] ? [VEHICLE_TIPS[criteria.vehicle]] : [];

  if (intent === AI_INTENTS.FIND_PLACES) {
    if (places.length === 0) return { ...empty, reply: `Mình chưa tìm thấy chỗ phù hợp${retrievalError ? '' : ' trong khu vực này'}. Bạn thử nới bán kính hoặc đổi từ khoá nhé.`, follow_up_suggestions: ['Tìm rộng hơn', 'Gợi ý chỗ khác'] };
    const top = places.slice(0, 3);
    return {
      ...empty,
      reply: `Mình tìm được ${places.length} chỗ hợp ý, nổi bật là ${top.map((place) => place.name).join(', ')}.${assumptionNote}`,
      recommended_place_ids: top.map((place) => String(place.id)),
      tips,
      follow_up_suggestions: ['Lên lộ trình với các quán này', 'Rẻ hơn chút'],
    };
  }

  if (AI_INTENTS.ASK_INFO === intent && options.length === 0) {
    return { ...empty, reply: 'Mình chưa chắc bạn cần gì. Bạn cho mình biết đi mấy người, ở khu nào và ngân sách để mình lên lộ trình nhé.', follow_up_suggestions: TRIP_FOLLOW_UPS };
  }
  if (options.length === 0) {
    return { ...empty, reply: `${retrievalError ?? 'Mình chưa tìm được lộ trình phù hợp.'} Bạn thử tăng bán kính, ngân sách hoặc đổi giờ đi nhé.`, follow_up_suggestions: ['Tìm rộng hơn', 'Tăng ngân sách', 'Đổi sang buổi tối'] };
  }

  const [best] = options;
  const stops = best.stops.map((stop) => `${stop.place.name} (${stop.meal ? MEAL_WINDOWS[stop.meal].label : VISIT_ROLE_LABELS[stop.role]?.toLowerCase() ?? ''} ${stop.arrival_time})`).join(' → ');
  return {
    reply: `Mình lên được ${options.length} lộ trình. Gợi ý "${best.label}": ${stops}, khoảng ${formatMinutes(best.summary.total_minutes)}, ${formatVnd(best.summary.cost_per_person)}/người.${assumptionNote}`,
    option_notes: options.map((option) => ({ option_key: option.key, headline: option.label, why: option.description })),
    recommended_place_ids: [],
    tips,
    warnings: [weatherWarning(weather), ...tripWarnings(best)].filter(Boolean).slice(0, 3),
    follow_up_suggestions: TRIP_FOLLOW_UPS,
  };
};
