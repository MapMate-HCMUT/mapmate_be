// Bộ điều phối AI Planner — chạy các Agent theo thứ tự, ghi lại từng bước (trace) để giao diện hiển thị minh bạch:
//   0. Bộ lọc đầu vào   (inputGuard)        — làm sạch, che SĐT/email, đánh dấu prompt injection
//   1. Hiểu yêu cầu     (interpreter.agent) — Groq model nhanh, output theo schema (+ đánh giá: đủ / thiếu / phi thực tế / cấm)
//   2. Quyết định       — không được phép => từ chối; quá chung chung => hỏi lại (≤ 2 câu, tối đa 1 lượt);
//                         hỏi về 1 địa điểm => tra cứu (DB + Wikipedia + Open-Meteo); còn lại => lên lộ trình / tìm quán
//   3. Chuẩn hoá        (criteriaBuilder)   — kẹp giới hạn, tìm địa danh trong DB, ghi giả định
//   4. Kiểm tra khả thi (feasibility)       — ngân sách / thời gian làm được không, nếu không => phương án gần nhất
//   5. Truy vấn DB      (planner / search)  — lộ trình + địa điểm THẬT (+ dự báo thời tiết nếu đi trong 48 giờ)
//   6. Tư vấn           (advisor.agent)     — Groq model người dùng chọn, chỉ được nói về dữ liệu ở bước 5
// Bản multi-agent (Agent điều phối — orchestrator.js — quyết định mỗi lượt):
//   - hiểu chưa chắc => nhắc lại ý, hỏi xác nhận; sửa lộ trình mà không rõ điểm nào => hỏi chọn điểm
//   - Agent chỉnh sửa (editor.agent)  — sửa lộ trình có sẵn (phương án AI, lộ trình đã lưu / được chia sẻ) thay vì làm lại
//   - Agent xe buýt / metro (transit.agent) — đi công cộng => tuyến thật cho từng chặng, giờ đến tính lại theo tuyến
//   - Agent kiểm tra (verifier.agent) — giờ về, quán đóng cửa, ngân sách, chuyến xe cuối, ăn chay; trễ giờ về => sửa 1 vòng,
//     vẫn trễ => hỏi người dùng muốn bỏ điểm hay đi sớm hơn
// Chỉ 2 Agent gọi LLM (hiểu yêu cầu, tư vấn); các Agent còn lại là code => không tốn thêm lượt gọi Groq.
// Groq lỗi / chưa có key ở bước nào => bước đó tự chuyển sang bản dự phòng (luật / mẫu), pipeline vẫn trả kết quả.
import { AI_DEFAULT_TIER, AI_FIND_PLACES_LIMIT, AI_HISTORY_TURNS, AI_INTENTS, AI_PLAN_CHECKS, AI_RECENT_PLACES_MAX, AI_RECENT_SUGGESTION_TURNS, AI_TRIP_INTENTS, REQUEST_QUALITY } from '../../constants/ai.js';
import { ERROR_CODES, EXPLORE_ERROR_CODES } from '../../constants/errorCodes.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import { DEFAULT_PLACE_SORT, EXPLORE_CATEGORIES, PLACE_TAGS } from '../../constants/places.js';
import { nearbyQuerySchema } from '../../middlewares/validators/place.validator.js';
import { SAFE_ALTERNATIVES, SAFETY_CATEGORIES, SAFETY_REPLIES } from '../../constants/aiSafety.js';
import { AppError } from '../../utils/AppError.js';
import { haversineKm } from '../../utils/geo.js';
import { normalizeSearchText } from '../../utils/text.js';
import { getWeatherAt } from '../external/weather.service.js';
import { suggestItineraries } from '../itineraryPlanner.service.js';
import { searchPlaces, toPlaceView } from '../place.service.js';
import { buildClarifyReply, buildRefusalReply } from './adviceTemplates.js';
import { adviseUser } from './advisor.agent.js';
import { loadSession, persistSession, recentSuggestedIds, toHistory } from './aiSession.service.js';
import { questionsFor } from './clarifyQuestions.js';
import { buildCriteria, MEMORY_NOTE_PREFIX, tripMoment, vietnamNow } from './criteriaBuilder.js';
import { checkFeasibility } from './feasibility.js';
import { guardInput } from './inputGuard.js';
import { basePlanFromItinerary, basePlanFromOption, baseCriteriaOf, describeBasePlan, editPlan, loadBasePlaces, shortenStays } from './editor.agent.js';
import { interpretRequest } from './interpreter.agent.js';
import { extractDateHint, extractEndBy, extractTime } from './ruleInterpreter.js';
import { isLlmConfigured } from './llmClient.js';
import { ACTIONS, answerPending, CONFIRM_RETRY, confirmTurn, decideAction, isRepeatedAsk, memoryOffer, repeatTurn, retryReply } from './orchestrator.js';
import { planWithRealTransit } from './transit.agent.js';
import { tradeoffQuestion, verifyOptions } from './verifier.agent.js';
import { addNote, clearMemory, describeMemory, detectMemoryCommand, learnFromTurn, loadMemory, memorySuggestions } from './memory.service.js';
import { PENDING_KINDS, resolvePending } from './pendingRequest.js';
import { answerPlaceQuestion } from './placeAnswer.agent.js';
import { moderateWithModels } from './safety/moderator.js';
import { moderateByRules } from './safety/ruleModeration.js';

const PLANNING_INTENTS = [...AI_TRIP_INTENTS, AI_INTENTS.FIND_PLACES];
const EMPTY_ADVICE = { reply: '', tips: [], warnings: [], follow_up_suggestions: [] };
const WEATHER_HINTS = ['now', 'today', 'tonight', 'tomorrow'];
const FIND_POOL_FACTOR = 3; // trong ~48 giờ tới => dự báo đủ tin cậy
const MINUTES_PER_HOUR = 60;
const MAX_WARNINGS = 4;
const MAX_FOLLOW_UPS = 3;

const createTrace = () => {
  const steps = [];
  const run = async (key, label, task) => {
    const startedAt = Date.now();
    const result = await task();
    steps.push({ key, label, ms: Date.now() - startedAt, ...(result?.trace ?? {}) });
    return result;
  };
  return { steps, run };
};
const agentTrace = (result) => ({ status: result.source === 'llm' || result.skipped ? 'ok' : 'fallback', source: result.source, model: result.model ?? null, error: result.error ?? null });

// /api/ai/recommend gửi sẵn ngân sách, phương tiện, số người => điền vào chỗ model để trống.
const applyHints = (interpretation, hints) => {
  if (!hints) return interpretation;
  const criteria = { ...interpretation.criteria };
  criteria.budget_per_person ??= hints.budget ?? null;
  criteria.vehicle ??= hints.vehicle ?? null;
  criteria.people ??= hints.people ?? null;
  const intent = PLANNING_INTENTS.includes(interpretation.intent) ? interpretation.intent : AI_INTENTS.PLAN_TRIP;
  return { ...interpretation, intent, criteria };
};

const retrieve = async ({ intent, built, recentIds = [] }) => {
  const { criteria, mustInclude, exclude } = built;
  if (AI_TRIP_INTENTS.includes(intent)) {
    try {
      // Bốc thăm lại mỗi lần + tránh nơi vừa gợi ý => hỏi lại là ra lộ trình khác
      const plan = await suggestItineraries(criteria, mustInclude.map((place) => place._id), { excludeIds: exclude.map((place) => place._id), avoidIds: recentIds });
      return { options: plan.options, places: [], candidateCount: plan.candidate_count };
    } catch (error) {
      if (error.errorCode !== EXPLORE_ERROR_CODES.NO_MATCHING_PLACES) throw error;
      return { options: [], places: [], retrievalError: error.message };
    }
  }
  // Chỉ tìm quán: dùng chung bộ lọc Khám phá, từ khoá đầu tiên ("lẩu") làm ô tìm kiếm.
  // Ngân sách / người = giá thấp nhất của quán phải vừa (1 ly cà phê từ 35k vẫn hợp với "40k").
  const priceCap = Math.min(criteria.price_max ?? Infinity, criteria.trip_budget ?? Infinity);
  const filters = nearbyQuerySchema.parse({
    lat: criteria.origin.lat,
    lng: criteria.origin.lng,
    radius_km: criteria.radius_km,
    categories: criteria.categories.join(',') || undefined,
    tags: criteria.tags.join(',') || undefined,
    price_min: criteria.price_min || undefined,
    price_max: Number.isFinite(priceCap) ? priceCap : undefined,
    min_rating: criteria.min_rating ?? undefined,
    q: built.keywords[0],
    open_at: criteria.open_only ? criteria.start_time : undefined,
    vehicle: criteria.vehicle,
    sort: DEFAULT_PLACE_SORT,
    limit: AI_FIND_PLACES_LIMIT * FIND_POOL_FACTOR, // lấy dư => hỏi lại thì đưa quán chưa gợi ý lên trước
    auto_relax: 'true', // không có quán khớp hết điều kiện => nới dần, ghi chú cho người dùng biết
  });
  // AI giữ khách quan: không ưu tiên cửa hàng trả phí. Loại hình + phong cách người dùng hỏi KHÔNG bao giờ bị nới:
  // hỏi cà phê mà không có quán cà phê khớp => trả lời "không có", không nhét quán ăn vào cho đủ danh sách
  const lockedKeys = ['categories', 'tags', ...(filters.price_max !== undefined ? ['price_min', 'price_max'] : [])]; // có ngân sách => tìm xa hơn chứ không bỏ giá
  const found = await searchPlaces(filters, null, { promote: false, lockedKeys });
  if (found.relaxed?.labels.length) built.assumptions.push(`Không có chỗ khớp hết điều kiện — đã tạm bỏ: ${found.relaxed.labels.join(', ')}`);
  const fits = (place) => (!criteria.categories.length || criteria.categories.includes(place.category)) && (!criteria.tags.length || criteria.tags.some((tag) => place.tags?.includes(tag)));
  const pinned = mustInclude.map((place) => toPlaceView(place)); // quán người dùng gọi tên => luôn đứng đầu
  const seen = new Set(recentIds.map(String));
  const fresh = found.items.filter((item) => fits(item) && !pinned.some((place) => String(place.id) === String(item.id)));
  const places = dropDuplicatePlaces([...pinned, ...fresh.filter((item) => !seen.has(String(item.id))), ...fresh.filter((item) => seen.has(String(item.id)))]).slice(0, AI_FIND_PLACES_LIMIT);
  return { options: [], places, retrievalError: places.length ? null : noMatchMessage(criteria) };
};

// Dữ liệu mở hay có 2 bản ghi cho 1 quán ("Chidori Coffee in Bed" + "Chidori Coffee in Bed Sư Vạn Hạnh", cùng địa chỉ) => giữ 1
const DUPLICATE_RADIUS_KM = 0.2;
const coreName = (place) => normalizeSearchText(place.name).replace(/\(.*\)/g, '').trim();
const dropDuplicatePlaces = (places) =>
  places.filter((place, index) => !places.slice(0, index).some((kept) => {
    const [a, b] = [coreName(kept), coreName(place)];
    const near = haversineKm([kept.coordinates.lng, kept.coordinates.lat], [place.coordinates.lng, place.coordinates.lat]) < DUPLICATE_RADIUS_KM;
    return near && a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a));
  }));

const labelsOf = (values, vocabulary) => values.map((value) => vocabulary.find((item) => item.value === value)?.label.toLowerCase() ?? value).join(', ');
const noMatchMessage = ({ categories, tags, radius_km: radiusKm }) => {
  const what = [categories.length && labelsOf(categories, EXPLORE_CATEGORIES), tags.length && `phong cách ${labelsOf(tags, PLACE_TAGS)}`].filter(Boolean).join(', ');
  return `Không có chỗ nào ${what ? `đúng ${what} ` : ''}khớp yêu cầu trong khoảng ${radiusKm ?? 'đã chọn'} km.`;
};

// Từ chối vì vi phạm chính sách: lý do rõ ràng + câu hỏi thay thế (ưu tiên câu hợp sở thích đã ghi nhớ)
const safetyRefusal = (category, memory) => {
  const alternatives = [...new Set([...(category === SAFETY_CATEGORIES.SELF_HARM ? [] : memorySuggestions(memory).slice(0, 1)), ...(SAFE_ALTERNATIVES[category] ?? SAFE_ALTERNATIVES.jailbreak)])].slice(0, 3);
  return { kind: 'not_allowed', category, reasons: [SAFETY_REPLIES[category] ?? SAFETY_REPLIES.jailbreak], alternatives };
};

// Hỏi đúng 2 điều cốt lõi còn thiếu (làm gì + ở đâu) bằng câu dựng sẵn — đáp án chắc chắn hiểu được ở lượt sau
const VAGUE_QUESTIONS = questionsFor(['activity', 'area']);

/**
 * POST /api/ai/chat — 1 lượt trò chuyện.
 * @param {{ userId?, message, sessionId?, context?, origin?, tier?, hints?, itineraryId?, selectedOptionKey? }} input
 *   itineraryId: lộ trình đã lưu / được chia sẻ người dùng đưa cho AI chỉnh; selectedOptionKey: phương án đang xem (lượt trước)
 */
export const chatWithPlanner = async ({ userId = null, message, sessionId = null, context = null, origin = null, tier = AI_DEFAULT_TIER, hints = null, itineraryId = null, selectedOptionKey = null }) => {
  const { steps, run } = createTrace();
  const guarded = guardInput(message);
  if (guarded.flags.empty) throw new AppError('Bạn hãy nhập yêu cầu', HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR);

  const session = await loadSession(userId, sessionId);
  const previousCriteria = session?.criteria ?? context?.criteria ?? null;
  const previousMustVisitIds = (session ? session.must_visit_ids : context?.must_visit_ids) ?? [];
  // Nơi vừa gợi ý ở các lượt trước (đã đăng nhập: lấy từ phiên; khách: giao diện gửi kèm)
  const recentIds = session ? recentSuggestedIds(session, AI_RECENT_SUGGESTION_TURNS, AI_RECENT_PLACES_MAX) : context?.recent_place_ids ?? [];
  const pending = (session ? session.pending : context?.pending) ?? null;
  const askedBefore = [PENDING_KINDS.CLARIFY, PENDING_KINDS.CONFIRM, PENDING_KINDS.EDIT_TARGET, PENDING_KINDS.REPEAT].includes(pending?.kind);
  // Các câu người dùng vừa gửi (đăng nhập: trong phiên; khách: giao diện gửi kèm) — để biết họ đang hỏi lại y hệt
  const recentPrompts = session ? session.messages.filter((item) => item.role === 'user').slice(-AI_HISTORY_TURNS).map((item) => item.content) : context?.recent_prompts ?? [];
  const history = toHistory(session);
  const now = vietnamNow();
  const memory = await loadMemory(userId);
  steps.push({ key: 'guard', label: 'Kiểm tra câu hỏi', ms: 0, status: 'ok', detail: guarded.flags });

  // Lộ trình gốc cho Agent chỉnh sửa: lộ trình vừa đưa cho AI > lộ trình đang chỉnh trong phiên > phương án đang xem lượt trước
  const attachedNow = Boolean(itineraryId);
  const basePlan = attachedNow ? await basePlanFromItinerary(itineraryId, userId) : pickBasePlan({ session, context, selectedOptionKey });
  const basePlaces = basePlan ? await loadBasePlaces(basePlan) : [];
  const basePlanText = basePlaces.length ? describeBasePlan(basePlan, basePlaces) : null;

  const response = {
    intent: AI_INTENTS.ASK_INFO,
    reply: '',
    request_quality: REQUEST_QUALITY.OK,
    clarifying_questions: [],
    refusal: null,
    place_answer: null,
    weather: null,
    understood: null,
    options: [],
    places: [],
    tips: [],
    warnings: [],
    follow_up_suggestions: [],
    pending: null,
    memory_used: false,
    base_plan: null,
    flags: { pii_masked: guarded.flags.pii_masked, truncated: guarded.flags.truncated, continued: false },
    sources: { interpreter: 'none', advisor: 'template' },
    trace: steps,
  };
  // Lộ trình vừa đưa cho AI => nhớ trong phiên để các lượt sau tiếp tục chỉnh (kể cả khi lượt này chỉ hỏi lại)
  let planState = attachedNow ? { base_plan: basePlan } : {};
  const applyAdvice = (advice) => Object.assign(response, { reply: advice.reply, tips: advice.tips ?? [], warnings: advice.warnings ?? [], follow_up_suggestions: advice.follow_up_suggestions ?? [] });
  const finish = async () => {
    response.session_id = await persistSession({ session, userId, text: guarded.text, response, tier, planState });
    return response;
  };
  const refuse = (category) => {
    response.intent = AI_INTENTS.OUT_OF_SCOPE;
    response.request_quality = REQUEST_QUALITY.NOT_ALLOWED;
    response.refusal = safetyRefusal(category, memory);
    applyAdvice(buildRefusalReply(response.refusal));
    response.follow_up_suggestions = response.refusal.alternatives;
    return finish();
  };
  const ask = ({ reply, questions, pending: nextPending = null, key, detail }) => {
    response.clarifying_questions = questions;
    response.pending = nextPending;
    applyAdvice({ ...EMPTY_ADVICE, reply });
    steps.push({ key, label: 'Hỏi lại cho chắc', ms: 0, status: 'ok', detail });
    return finish();
  };

  // 0. Kiểm duyệt lớp 1 (luật) — vi phạm rõ ràng => từ chối ngay, không gửi gì cho Groq
  const ruled = moderateByRules(guarded.text);
  if (ruled) {
    steps.push({ key: 'moderate', label: 'Kiểm duyệt nội dung', ms: 0, status: 'empty', detail: { rules: ruled.category } });
    return refuse(ruled.category);
  }

  // 0b. Lệnh ghi nhớ ("nhớ giúp mình là...", "quên hết") — không cần LLM
  const command = detectMemoryCommand(guarded.text);
  if (command) {
    if (!userId) applyAdvice({ ...EMPTY_ADVICE, reply: 'Bạn đăng nhập để MapMate ghi nhớ sở thích và dùng cho các lần sau nhé.' });
    else if (command.type === 'forget') {
      await clearMemory(userId);
      applyAdvice({ ...EMPTY_ADVICE, reply: 'Mình đã xoá hết những gì đã ghi nhớ về bạn.' });
    } else {
      // Ghi chú sẽ được đưa vào prompt các lần sau => kiểm duyệt kỹ (cả model) trước khi lưu
      const checked = await moderateWithModels(command.note);
      if (checked.blocked) return refuse(checked.category);
      await addNote(userId, command.note);
      applyAdvice({ ...EMPTY_ADVICE, reply: `Đã ghi nhớ: “${command.note}”. Mình sẽ dùng cho các lần gợi ý sau — bạn xem hoặc xoá trong mục Ghi nhớ.`, follow_up_suggestions: ['Gợi ý quán ăn tối nay'] });
    }
    response.memory_used = true;
    return finish();
  }

  // 0c. Trả lời câu hỏi xác nhận của Agent điều phối: "đúng rồi" => làm luôn ý đã hiểu; "để mình nói lại" => mời nói lại
  if (pending?.kind === PENDING_KINDS.CONFIRM && CONFIRM_RETRY.test(guarded.text) && guarded.text.length < 40) {
    applyAdvice({ ...EMPTY_ADVICE, ...retryReply() });
    return finish();
  }
  const shortcut = answerPending(pending, guarded.text);

  // 1. Kiểm duyệt lớp 2–3 (Prompt Guard + gpt-oss-safeguard) SONG SONG với Hiểu yêu cầu
  const memoryText = describeMemory(memory);
  let understood;
  if (shortcut) {
    understood = { interpretation: shortcut.interpretation, source: 'pending' };
    steps.push({ key: 'interpret', label: 'Hiểu yêu cầu', ms: 0, status: 'ok', source: 'pending', detail: { answered: pending.kind } });
  } else {
    const [moderation, interpreted] = await Promise.all([
      run('moderate', 'Kiểm duyệt nội dung', async () => {
        const result = await moderateWithModels(guarded.text);
        return { ...result, trace: { status: result.blocked ? 'empty' : 'ok', detail: result.detail } };
      }),
      run('interpret', 'Hiểu yêu cầu', async () => {
        const result = await interpretRequest({ text: guarded.text, flags: guarded.flags, history, previousCriteria, nowLabel: now.label, askedBefore, memoryText, basePlanText });
        return { ...result, trace: agentTrace(result) };
      }),
    ]);
    if (moderation.blocked) return refuse(moderation.category);
    understood = interpreted;
  }
  response.sources.interpreter = understood.source;
  // Bước hiểu yêu cầu cũng tự đánh giá an toàn — phòng khi lớp 2–3 hết hạn mức / lỗi
  if (understood.interpretation.safety_category !== SAFETY_CATEGORIES.NONE) return refuse(understood.interpretation.safety_category);

  const resolved = shortcut ? { interpretation: understood.interpretation, continued: true } : resolvePending(pending, applyHints(understood.interpretation, hints));
  let { interpretation } = resolved;
  const { continued } = resolved;

  // 1b. Gửi y hệt lần thứ 3 => hỏi lại cần đổi gì (chỉ 1 chỗ / chỗ khác / gần hơn / rẻ hơn) thay vì trả lời y như 2 lần trước
  if (!shortcut && !askedBefore && PLANNING_INTENTS.includes(interpretation.intent) && isRepeatedAsk(guarded.text, recentPrompts)) {
    const repeat = repeatTurn(interpretation);
    response.intent = interpretation.intent;
    return ask({ reply: repeat.reply, questions: repeat.questions, pending: repeat.pending, key: 'repeat', detail: { reason: 'same_question' } });
  }

  // 2. Agent điều phối quyết định làm gì
  const decision = decideAction({ interpretation, source: understood.skipped ? 'pending' : understood.source, llmConfigured: isLlmConfigured(), askedBefore, continued, basePlan: basePlaces.length ? basePlan : null, attachedNow, text: guarded.text });
  steps.push({ key: 'orchestrate', label: 'Điều phối', ms: 0, status: 'ok', detail: { action: decision.action, reason: decision.reason, base_plan: basePlan ? basePlan.source : null } });
  if (decision.action === ACTIONS.EDIT && interpretation.intent !== AI_INTENTS.REFINE_TRIP) interpretation = { ...interpretation, intent: AI_INTENTS.REFINE_TRIP };
  // "Lộ trình khác đi" => lên lại theo đúng tiêu chí cũ (khu vực, giờ, ngân sách), chỉ đổi địa điểm
  if (decision.reason === 'another_route') interpretation = { ...interpretation, intent: AI_INTENTS.REFINE_TRIP, request_quality: REQUEST_QUALITY.OK };
  // Chỉ muốn tới 1 chỗ => tìm vài quán đúng loại để chọn, không dựng lộ trình nhiều điểm
  if (decision.reason === 'single_stop') interpretation = { ...interpretation, intent: AI_INTENTS.FIND_PLACES };
  if (decision.reason === 'general_outing') interpretation = { ...interpretation, intent: AI_INTENTS.PLAN_TRIP };
  const { intent } = interpretation;
  Object.assign(response, { intent, request_quality: interpretation.request_quality });
  response.flags.continued = continued;

  // 2a. Không được phép (model đánh giá) => từ chối lịch sự, không chạy tiếp
  if (decision.action === ACTIONS.REFUSE) {
    const fallback = safetyRefusal(SAFETY_CATEGORIES.OTHER, memory);
    response.refusal = { ...fallback, reasons: [interpretation.refusal_reason ?? fallback.reasons[0]] };
    applyAdvice(buildRefusalReply(response.refusal));
    return finish();
  }

  // 2b. Quá chung chung => hỏi lại (đáp án hiện thành nút bấm); lượt sau ghép câu trả lời vào yêu cầu này
  if (decision.action === ACTIONS.CLARIFY) {
    return ask({ reply: buildClarifyReply(VAGUE_QUESTIONS).reply, questions: VAGUE_QUESTIONS, pending: { kind: PENDING_KINDS.CLARIFY, interpretation }, key: 'clarify', detail: { questions: VAGUE_QUESTIONS.length } });
  }

  // 2c. Hiểu chưa chắc => nhắc lại ý đã hiểu, hỏi "đúng không?" trước khi làm
  if (decision.action === ACTIONS.CONFIRM) {
    const confirm = confirmTurn(interpretation);
    return ask({ reply: confirm.reply, questions: confirm.questions, pending: confirm.pending, key: 'confirm', detail: { reason: decision.reason } });
  }

  // 2d. Hỏi về 1 địa điểm
  if (decision.action === ACTIONS.PLACE) {
    const answered = await run('place', 'Tra cứu địa điểm', async () => {
      const result = await answerPlaceQuestion({ tier, text: guarded.text, interpretation, origin: origin ?? previousCriteria?.origin ?? null, now, history });
      return { ...result, trace: { ...agentTrace(result), detail: { found: Boolean(result.place_answer.place), wikipedia: Boolean(result.place_answer.wikipedia), weather: Boolean(result.place_answer.weather) } } };
    });
    response.place_answer = answered.place_answer;
    response.reply = answered.answer.answer;
    response.follow_up_suggestions = answered.answer.follow_up_suggestions;
    response.sources.advisor = answered.source;
    return finish();
  }

  // 3–5. Chuẩn hoá → (chỉnh sửa | kiểm tra khả thi → lên lộ trình) → xe buýt / metro → kiểm tra
  let built = null;
  let options = [];
  let places = [];
  let retrievalError = null;
  let tradeoff = null;
  const isEdit = decision.action === ACTIONS.EDIT;
  if (isEdit || decision.action === ACTIONS.PLAN) {
    const criteriaBase = isEdit ? baseCriteriaOf(basePlan, previousCriteria) : previousCriteria;
    // Chỉnh lộ trình: khuôn bữa / thứ tự do lộ trình gốc quyết định — "đổi sang quán lẩu" không có nghĩa là dời sang giờ ăn tối;
    // chỉnh hay xin "lộ trình khác" đều giữ giờ / ngày cũ trừ khi câu của người dùng nói giờ mới
    if (isEdit || decision.reason === 'another_route') {
      const lower = guarded.text.toLowerCase();
      const saysTime = Boolean(extractTime(extractEndBy(lower).rest)) || extractDateHint(lower) !== 'unspecified';
      interpretation = {
        ...interpretation,
        criteria: { ...interpretation.criteria, ...(isEdit ? { meals: [], sequence: [], food_tour: false, stop_count: null } : {}), ...(saysTime ? {} : { start_time: null, date_hint: 'unspecified' }) },
      };
    }
    built = await run('criteria', 'Chuẩn hoá tiêu chí', async () => {
      const result = await buildCriteria({ interpretation, previousCriteria: criteriaBase, previousMustVisitIds: isEdit ? [] : previousMustVisitIds, clientOrigin: origin, now, memory });
      return { ...result, keywords: result.searchKeywords, trace: { status: 'ok', detail: { assumptions: result.assumptions.length, must_visit: result.mustInclude.length } } };
    });
    response.understood = {
      criteria: built.criteria,
      assumptions: built.assumptions,
      must_visit: built.mustInclude.map((place) => ({ id: place._id, name: place.name })),
      avoided: built.exclude.map((place) => ({ id: place._id, name: place.name })),
    };
    const tripDate = tripMoment({ date_hint: interpretation.criteria.date_hint, start_time: built.criteria.start_time }, now).date;

    if (isEdit) {
      // 3a. Agent chỉnh sửa: sửa đúng chỗ người dùng nói trên lộ trình gốc
      const edited = await run('edit', 'Chỉnh sửa lộ trình', async () => editPlan({ basePlan, places: basePlaces, interpretation, criteria: built.criteria, mentionedMustVisit: built.mentionedMustVisit, avoid: built.exclude }));
      if (edited.ambiguous) {
        return ask({ reply: edited.ambiguous.question, questions: [{ question: edited.ambiguous.question, options: edited.ambiguous.options }], pending: { kind: PENDING_KINDS.EDIT_TARGET, interpretation, edit_index: edited.ambiguous.edit_index, options: edited.ambiguous.options }, key: 'edit_target', detail: { options: edited.ambiguous.options.length } });
      }
      built.assumptions.push(...edited.unresolved);
      response.base_plan = { source: basePlan.source, itinerary_id: basePlan.itinerary_id, name: basePlan.name, is_mine: basePlan.is_mine, changes: edited.changes, unresolved: edited.unresolved, before: basePlaces.map((place) => place.name) };
      if (edited.option) {
        options = await withTransitAndChecks({ options: [edited.option], criteria: built.criteria, date: tripDate, stayOverrides: edited.stayOverrides, run, steps });
        // Vẫn trễ giờ về => rút thời gian ở lại mỗi điểm về mức tối thiểu rồi kiểm tra lại
        if (options[0]?.checks.some((issue) => issue.code === AI_PLAN_CHECKS.ENDS_TOO_LATE)) {
          const shortened = await shortenStays(options[0], built.criteria);
          options = await withTransitAndChecks({ options: [shortened], criteria: built.criteria, date: tripDate, run, steps, label: 'Kiểm tra lại sau khi rút ngắn' });
        }
        tradeoff = tradeoffQuestion(options[0], built.criteria);
      } else retrievalError = edited.unresolved.at(-1) ?? 'Không chỉnh được lộ trình này.';
    } else {
      // 3b. Lộ trình / tìm quán mới
      const feasibility = checkFeasibility({ interpretation, criteria: built.criteria, mustInclude: built.mustInclude });
      steps.push({ key: 'feasibility', label: 'Kiểm tra khả thi', ms: 0, status: feasibility.feasible ? 'ok' : 'empty', detail: { reasons: feasibility.reasons.length } });
      if (!feasibility.feasible || interpretation.request_quality === REQUEST_QUALITY.UNREALISTIC) {
        const reasons = feasibility.reasons.length ? feasibility.reasons : [interpretation.refusal_reason ?? 'Yêu cầu này khó thực hiện trong thực tế.'];
        response.refusal = { kind: 'unrealistic', reasons, alternatives: feasibility.alternatives };
        response.pending = { kind: PENDING_KINDS.UNREALISTIC, interpretation };
        applyAdvice(buildRefusalReply(response.refusal));
        return finish();
      }
      Object.assign(built.criteria, feasibility.criteriaPatch);
      built.assumptions.push(...feasibility.notes);

      const retrieveOnce = (label) =>
        run('retrieve', label ?? (AI_TRIP_INTENTS.includes(intent) ? 'Lên lộ trình từ dữ liệu thật' : 'Tìm địa điểm'), async () => {
          const result = await retrieve({ intent, built, recentIds });
          return { ...result, trace: { status: result.retrievalError ? 'empty' : 'ok', detail: { options: result.options.length, places: result.places.length, candidates: result.candidateCount ?? null } } };
        });
      let retrieved = await retrieveOnce();
      options = await withTransitAndChecks({ options: retrieved.options, criteria: built.criteria, date: tripDate, run, steps });
      // Agent kiểm tra báo mọi phương án trễ giờ về => rút thời lượng, lên lại 1 lần
      const late = options[0]?.checks.find((issue) => issue.code === AI_PLAN_CHECKS.ENDS_TOO_LATE);
      if (late && options.every((option) => option.checks.some((issue) => issue.code === AI_PLAN_CHECKS.ENDS_TOO_LATE))) {
        built.criteria.duration_hours = Math.max(1, built.criteria.duration_hours - Math.ceil(late.minutes / MINUTES_PER_HOUR));
        built.criteria.fill_duration = false;
        built.criteria.stop_count = Math.max(1, Math.min(...options.map((option) => option.stops.length)) - 1);
        retrieved = await retrieveOnce('Lên lại lộ trình ngắn hơn cho kịp giờ về');
        options = await withTransitAndChecks({ options: retrieved.options, criteria: built.criteria, date: tripDate, run, steps, label: 'Kiểm tra lại' });
        tradeoff = tradeoffQuestion(options[0], built.criteria);
      }
      places = retrieved.places;
      retrievalError = retrieved.retrievalError;
    }
    if (options.length && WEATHER_HINTS.includes(interpretation.criteria.date_hint)) {
      const { lat, lng } = built.criteria.origin;
      response.weather = await getWeatherAt({ lat, lng, ...tripMoment({ date_hint: interpretation.criteria.date_hint, start_time: built.criteria.start_time }, now) });
    }
  }

  // 6. Tư vấn
  const advised = await run('advise', 'Viết lời tư vấn', async () => {
    const result = await adviseUser({
      tier,
      text: guarded.text,
      intent,
      criteria: built?.criteria ?? null,
      assumptions: built?.assumptions ?? [],
      options,
      places,
      weather: response.weather,
      refusalReason: intent === AI_INTENTS.OUT_OF_SCOPE ? interpretation.refusal_reason : null,
      retrievalError,
      history,
      basePlan: isEdit ? response.base_plan : null,
    });
    return { ...result, trace: agentTrace(result) };
  });

  const { advice } = advised;
  const notes = new Map(advice.option_notes.map((note) => [note.option_key, note]));
  applyAdvice(advice);
  if (isEdit && response.base_plan) response.reply = [editSummary(response.base_plan), response.reply].filter(Boolean).join(' ');
  response.sources.advisor = advised.source;
  response.options = options.map((option) => ({ ...option, ai_note: notes.get(option.key) ?? null }));
  response.places = places.map((place) => ({ ...place, ai_recommended: advice.recommended_place_ids.includes(String(place.id)) }));
  // Cảnh báo của Agent kiểm tra (phương án đầu) đứng trước, không lặp
  const checkMessages = (options[0]?.checks ?? []).map((issue) => issue.message);
  response.warnings = [...new Set([...checkMessages, ...response.warnings])].slice(0, MAX_WARNINGS);
  if (tradeoff) {
    response.clarifying_questions = [tradeoff];
    response.follow_up_suggestions = tradeoff.options;
  }
  const offer = memoryOffer({ userId, memory, interpretation, text: guarded.text });
  if (offer) response.follow_up_suggestions = [offer, ...response.follow_up_suggestions.filter((item) => item !== offer)].slice(0, MAX_FOLLOW_UPS);
  response.memory_used = Boolean(built?.assumptions.some((note) => note.startsWith(MEMORY_NOTE_PREFIX)));

  // Lộ trình để lượt sau chỉnh tiếp: bản vừa chỉnh (giữ nguồn gốc — lộ trình đã lưu / được chia sẻ) hoặc các phương án mới
  if (isEdit && options[0]) {
    planState = { base_plan: basePlanFromOption(options[0], built.criteria, { source: basePlan.source, itinerary_id: basePlan.itinerary_id, is_mine: basePlan.is_mine, name: basePlan.name }), last_options: null };
  } else if (options.length) {
    planState = { base_plan: null, last_options: options.map((option) => basePlanFromOption(option, built.criteria, { option_key: option.key })) };
  }
  // Học sở thích từ những gì người dùng NÓI RA (chỉ khi đã đăng nhập, ghi nhớ đang bật)
  // Chỉ học từ yêu cầu MỚI: lượt sửa lặp lại tiêu chí cũ — đếm cả vào thì 1 cuộc trò chuyện đã thành "sở thích"
  if (userId && built && !isEdit && intent !== AI_INTENTS.REFINE_TRIP && memory?.enabled !== false) await learnFromTurn(userId, { ...interpretation, criteria: { ...interpretation.criteria, keywords: built.searchKeywords } }, guarded.text).catch(() => null);
  return finish();
};

// Lộ trình gốc khi người dùng không đưa lộ trình nào lượt này: đang chỉnh dở trong phiên, hoặc phương án đang xem lượt trước
const pickBasePlan = ({ session, context, selectedOptionKey }) => {
  const lastOptions = session ? session.last_options : null;
  if (selectedOptionKey && lastOptions?.length) {
    const selected = lastOptions.find((option) => option.option_key === selectedOptionKey);
    if (selected) return selected;
  }
  if (session?.base_plan) return session.base_plan;
  if (lastOptions?.length) return lastOptions[0];
  return context?.base_plan ?? null; // khách: giao diện gửi kèm phương án đang xem
};

// Câu mở đầu khi chỉnh lộ trình — dựng từ kết quả THẬT của Agent chỉnh sửa (model hay nói sai "chưa thêm được" dù đã thêm)
const editSummary = ({ changes, unresolved, is_mine: isMine, source, name }) => {
  const done = changes.length ? `Mình đã chỉnh "${name}": ${changes.join('; ')}.` : `Mình giữ nguyên các điểm của "${name}" và tính lại giờ theo yêu cầu mới.`;
  const notDone = unresolved.length ? ` Chưa làm được: ${unresolved.join('; ')}.` : '';
  const shared = source === 'itinerary' && !isMine ? ' Đây là lộ trình người khác chia sẻ — bấm "Lưu lộ trình này" để có bản của riêng bạn.' : '';
  return `${done}${notDone}${shared}`;
};

// Agent xe buýt / metro rồi Agent kiểm tra (2 bước trace riêng)
const withTransitAndChecks = async ({ options, criteria, date, stayOverrides = {}, run, label = null }) => {
  if (!options.length) return [];
  const transit = await run('transit', 'Tìm tuyến xe buýt / metro', async () => planWithRealTransit({ options, criteria, date, stayOverrides }));
  const verified = await run('verify', label ?? 'Kiểm tra lộ trình', async () => verifyOptions(transit.options, criteria));
  return verified.options;
};
