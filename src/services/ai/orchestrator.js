// Agent điều phối — quyết định mỗi lượt làm gì, và khi nào nên HỎI LẠI cho chắc thay vì đoán:
//   refuse  — vi phạm chính sách                      place — hỏi về 1 địa điểm cụ thể
//   chat    — chào hỏi / trò chuyện / hỏi thông tin    clarify — quá chung chung (thiếu cả việc lẫn nơi)
//   confirm — hiểu chưa chắc (Agent hiểu yêu cầu lỗi, phải đoán bằng luật) => nhắc lại ý đã hiểu, hỏi "đúng không?"
//   edit    — có lộ trình gốc và người dùng muốn sửa nó  plan — lên lộ trình / tìm quán mới
// Sau khi làm: Agent kiểm tra báo trễ giờ về mà sửa không được => hỏi đánh đổi; Agent chỉnh sửa không rõ điểm nào => hỏi chọn điểm.
// Mọi câu hỏi đều kèm đáp án bấm được (câu bộ hiểu câu đọc được) và tối đa 1 lượt hỏi cho mỗi yêu cầu.
import { AI_INTENTS, AI_TRIP_INTENTS, REQUEST_QUALITY } from '../../constants/ai.js';
import { SAFETY_CATEGORIES } from '../../constants/aiSafety.js';
import { VISIT_ROLE_LABELS } from '../../constants/tripRules.js';
import { formatVnd } from '../../utils/money.js';
import { PENDING_KINDS } from './pendingRequest.js';

export const ACTIONS = { REFUSE: 'refuse', PLACE: 'place', CHAT: 'chat', CLARIFY: 'clarify', CONFIRM: 'confirm', EDIT: 'edit', PLAN: 'plan' };
const PLANNING_INTENTS = [...AI_TRIP_INTENTS, AI_INTENTS.FIND_PLACES];
// "Gợi ý lộ trình khác đi" => lên lộ trình mới chứ không sửa lộ trình đang có
const ANOTHER_ROUTE = /(khác đi|cái khác|lộ trình khác|gợi ý khác|lộ trình mới|đổi gió|thử cái khác|làm lại từ đầu)/;
const CONFIRM_MIN_LENGTH = 25; // câu ngắn ("quán lẩu Q1") đoán bằng luật vẫn đủ chắc, không hỏi lại cho phiền
export const CONFIRM_YES = /^\s*(đúng|đúng rồi|ừ|uh|ok|oke|okay|chuẩn|chính xác|làm luôn|được|yes|y)\b/i;
export const CONFIRM_RETRY = /(nói rõ hơn|nói lại|sai rồi|không phải)/i;
export const CONFIRM_OPTIONS = ['Đúng rồi, làm luôn', 'Để mình nói rõ hơn'];

// Chỉ hỏi lại khi THẬT SỰ quá chung chung: chưa biết làm gì VÀ chưa biết đi đâu / lúc nào
const isTooVague = ({ criteria, places_mentioned: places }) => {
  const hasActivity = criteria.categories.length || criteria.tags.length || criteria.keywords.length || criteria.sequence.length || criteria.meals.length || criteria.food_tour;
  return !hasActivity && !criteria.district && !places.length;
};

// Có cần sửa lộ trình gốc (thay vì lên lộ trình mới)?
const wantsEdit = ({ interpretation, basePlan, attachedNow, text }) => {
  if (!basePlan || ANOTHER_ROUTE.test(text.toLowerCase())) return false;
  if (attachedNow) return true; // vừa đưa 1 lộ trình cho AI => mọi yêu cầu là sửa lộ trình đó
  if (interpretation.intent !== AI_INTENTS.REFINE_TRIP) return false;
  const { criteria, edits, reorder, places_mentioned: mentions } = interpretation;
  const timingOrSetup = criteria.end_by || criteria.start_time || criteria.vehicle || criteria.people || criteria.duration_hours;
  const byName = mentions.some((mention) => mention.role === 'avoid' || mention.role === 'must_visit');
  // Chỉ thêm loại hình chung chung ("thêm phần vui chơi") mà không có thao tác cụ thể => để bộ lên lộ trình làm lại
  return Boolean(edits.length || reorder || timingOrSetup || criteria.price_level === 'cheap' || byName);
};

/**
 * Bước quyết định của Agent điều phối.
 * @param {{ interpretation, source: 'llm'|'rules'|'pending', llmConfigured, askedBefore, continued, basePlan, attachedNow, text }} input
 * @returns {{ action, reason }}
 */
export const decideAction = ({ interpretation, source, llmConfigured, askedBefore, continued, basePlan = null, attachedNow = false, text }) => {
  if (interpretation.request_quality === REQUEST_QUALITY.NOT_ALLOWED || interpretation.safety_category !== SAFETY_CATEGORIES.NONE) return { action: ACTIONS.REFUSE, reason: 'policy' };
  if (interpretation.intent === AI_INTENTS.ASK_PLACE) return { action: ACTIONS.PLACE, reason: 'ask_place' };
  if (!PLANNING_INTENTS.includes(interpretation.intent) && !attachedNow) return { action: ACTIONS.CHAT, reason: interpretation.intent };
  // Đang có lộ trình mà xin "lộ trình khác" => lên lại theo tiêu chí cũ, không hỏi lại "bạn muốn đi đâu"
  if (basePlan && ANOTHER_ROUTE.test(text.toLowerCase())) return { action: ACTIONS.PLAN, reason: 'another_route' };
  const edit = wantsEdit({ interpretation, basePlan, attachedNow, text });
  if (!edit && interpretation.request_quality === REQUEST_QUALITY.NEEDS_INFO && !askedBefore && !continued && isTooVague(interpretation)) {
    return { action: ACTIONS.CLARIFY, reason: 'too_vague' };
  }
  // Agent hiểu yêu cầu (LLM) lỗi => đang đoán bằng luật; câu dài / nhiều ý dễ hiểu sai => nhắc lại ý hiểu, hỏi trước khi làm
  if (llmConfigured && source === 'rules' && !askedBefore && !continued && text.trim().length >= CONFIRM_MIN_LENGTH) {
    return { action: ACTIONS.CONFIRM, reason: 'low_confidence' };
  }
  return { action: edit ? ACTIONS.EDIT : ACTIONS.PLAN, reason: edit ? (attachedNow ? 'attached_plan' : 'refine_plan') : interpretation.intent };
};

// ── Nhắc lại ý đã hiểu (để người dùng xác nhận) ──
const VEHICLE_LABELS = { bike: 'xe máy', car: 'ô tô', walk: 'đi bộ', public: 'xe buýt / metro', bus: 'xe buýt', metro_grab: 'metro + Grab' };
const DATE_LABELS = { now: 'ngay bây giờ', today: 'hôm nay', tonight: 'tối nay', tomorrow: 'ngày mai', weekend: 'cuối tuần' };
const EDIT_VERBS = { add: 'thêm', remove: 'bỏ', replace: 'đổi' };

const describeEdits = (edits) =>
  edits.map((edit) => {
    const target = edit.target_name ?? (edit.stop_number ? `điểm ${edit.stop_number}` : edit.target_role ? VISIT_ROLE_LABELS[edit.target_role]?.toLowerCase() : null);
    const next = [edit.new_role && VISIT_ROLE_LABELS[edit.new_role]?.toLowerCase(), edit.keyword].filter(Boolean).join(' ');
    return [EDIT_VERBS[edit.action], target, edit.action === 'replace' && next ? `thành ${next}` : edit.action === 'add' ? next : ''].filter(Boolean).join(' ');
  });

export const summarizeUnderstanding = (interpretation) => {
  const { criteria } = interpretation;
  const parts = [
    ...describeEdits(interpretation.edits ?? []),
    interpretation.reorder && 'sắp xếp lại thứ tự',
    criteria.keywords.length && criteria.keywords.join(', '),
    criteria.district && `ở ${criteria.district}`,
    DATE_LABELS[criteria.date_hint],
    criteria.start_time && `đi lúc ${criteria.start_time}`,
    criteria.end_by && `về trước ${criteria.end_by}`,
    criteria.people && `${criteria.people} người`,
    criteria.budget_per_person && `khoảng ${formatVnd(criteria.budget_per_person)}/người`,
    criteria.budget_total && `tổng ${formatVnd(criteria.budget_total)}`,
    criteria.vehicle && `đi ${VEHICLE_LABELS[criteria.vehicle] ?? criteria.vehicle}`,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'bạn muốn đi chơi nhưng mình chưa rõ đi đâu, làm gì';
};

// Ý đã hiểu nằm ngay trong câu hỏi (giao diện hiện câu hỏi + nút bấm, không hiện riêng lời nhắn)
export const confirmTurn = (interpretation) => {
  const summary = summarizeUnderstanding(interpretation);
  return {
    reply: `Mình muốn chắc là hiểu đúng ý bạn trước khi lên lộ trình: ${summary}. Đúng không?`,
    questions: [{ question: `Mình hiểu là: ${summary}. Đúng không?`, options: CONFIRM_OPTIONS }],
    pending: { kind: PENDING_KINDS.CONFIRM, interpretation },
  };
};

/** Câu trả lời cho câu hỏi xác nhận / chọn điểm => bỏ qua bước hiểu yêu cầu (không tốn lượt gọi LLM) */
export const answerPending = (pending, text) => {
  if (pending?.kind === PENDING_KINDS.CONFIRM && CONFIRM_YES.test(text) && !CONFIRM_RETRY.test(text)) {
    return { interpretation: pending.interpretation, source: 'pending' };
  }
  if (pending?.kind === PENDING_KINDS.EDIT_TARGET) {
    const chosen = pending.options?.find((name) => name.toLowerCase() === text.trim().toLowerCase());
    if (!chosen) return null;
    const edits = pending.interpretation.edits.map((edit, index) => (index === pending.edit_index ? { ...edit, target_name: chosen, stop_number: null, target_role: null } : edit));
    return { interpretation: { ...pending.interpretation, edits }, source: 'pending' };
  }
  return null;
};

export const retryReply = () => ({
  reply: 'Bạn cứ nói lại giúp mình nhé — đi khu nào, lúc nào, mấy người, muốn ăn / chơi gì là mình lên lộ trình được ngay.',
  follow_up_suggestions: ['Tối nay 2 người ăn tối ở Quận 1', 'Cuối tuần cả nhà đi công viên'],
});

// Gợi ý LƯU ghi nhớ (người dùng bấm thì mới lưu — không tự học từ 1 lần nhắc "quán chay")
const SELF_VEGETARIAN = /(mình|tôi|tớ|em|anh|chị|nhà mình|cả nhà|bọn mình)\s+(là người\s+|đều\s+)?ăn chay/i;
export const isSelfDescribedVegetarian = (text) => SELF_VEGETARIAN.test(text);
export const memoryOffer = ({ userId, memory, interpretation, text }) => {
  if (!userId || memory?.enabled === false || memory?.facts?.diet === 'chay') return null;
  const askedVegetarian = interpretation.criteria.keywords.some((keyword) => /chay/i.test(keyword)) || (interpretation.edits ?? []).some((edit) => /chay/i.test(edit.keyword ?? ''));
  return askedVegetarian && !isSelfDescribedVegetarian(text) ? 'Nhớ giúp mình là mình ăn chay' : null;
};
