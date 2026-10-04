// Bộ điều phối AI Planner — chạy các Agent theo thứ tự, ghi lại từng bước (trace) để giao diện hiển thị minh bạch:
//   0. Bộ lọc đầu vào   (inputGuard)        — làm sạch, che SĐT/email, đánh dấu prompt injection
//   1. Hiểu yêu cầu     (interpreter.agent) — Groq model nhanh, output theo schema (+ đánh giá: đủ / thiếu / phi thực tế / cấm)
//   2. Quyết định       — không được phép => từ chối; quá chung chung => hỏi lại (≤ 2 câu, tối đa 1 lượt);
//                         hỏi về 1 địa điểm => tra cứu (DB + Wikipedia + Open-Meteo); còn lại => lên lộ trình / tìm quán
//   3. Chuẩn hoá        (criteriaBuilder)   — kẹp giới hạn, tìm địa danh trong DB, ghi giả định
//   4. Kiểm tra khả thi (feasibility)       — ngân sách / thời gian làm được không, nếu không => phương án gần nhất
//   5. Truy vấn DB      (planner / search)  — lộ trình + địa điểm THẬT (+ dự báo thời tiết nếu đi trong 48 giờ)
//   6. Tư vấn           (advisor.agent)     — Groq model người dùng chọn, chỉ được nói về dữ liệu ở bước 5
// Groq lỗi / chưa có key ở bước nào => bước đó tự chuyển sang bản dự phòng (luật / mẫu), pipeline vẫn trả kết quả.
import { AI_DEFAULT_TIER, AI_FIND_PLACES_LIMIT, AI_INTENTS, AI_TRIP_INTENTS, REQUEST_QUALITY } from '../../constants/ai.js';
import { ERROR_CODES, EXPLORE_ERROR_CODES } from '../../constants/errorCodes.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import { DEFAULT_PLACE_SORT } from '../../constants/places.js';
import { nearbyQuerySchema } from '../../middlewares/validators/place.validator.js';
import { AppError } from '../../utils/AppError.js';
import { getWeatherAt } from '../external/weather.service.js';
import { suggestItineraries } from '../itineraryPlanner.service.js';
import { searchPlaces, toPlaceView } from '../place.service.js';
import { buildClarifyReply, buildRefusalReply } from './adviceTemplates.js';
import { adviseUser } from './advisor.agent.js';
import { loadSession, persistSession, toHistory } from './aiSession.service.js';
import { questionsFor } from './clarifyQuestions.js';
import { buildCriteria, tripMoment, vietnamNow } from './criteriaBuilder.js';
import { checkFeasibility } from './feasibility.js';
import { guardInput } from './inputGuard.js';
import { interpretRequest } from './interpreter.agent.js';
import { PENDING_KINDS, resolvePending } from './pendingRequest.js';
import { answerPlaceQuestion } from './placeAnswer.agent.js';

const PLANNING_INTENTS = [...AI_TRIP_INTENTS, AI_INTENTS.FIND_PLACES];
const WEATHER_HINTS = ['now', 'today', 'tonight', 'tomorrow']; // trong ~48 giờ tới => dự báo đủ tin cậy

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
const agentTrace = (result) => ({ status: result.source === 'llm' ? 'ok' : 'fallback', source: result.source, model: result.model ?? null, error: result.error ?? null });

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

const retrieve = async ({ intent, built }) => {
  const { criteria, mustInclude, exclude } = built;
  if (AI_TRIP_INTENTS.includes(intent)) {
    try {
      const plan = await suggestItineraries(criteria, mustInclude.map((place) => place._id), { excludeIds: exclude.map((place) => place._id) });
      return { options: plan.options, places: [], candidateCount: plan.candidate_count };
    } catch (error) {
      if (error.errorCode !== EXPLORE_ERROR_CODES.NO_MATCHING_PLACES) throw error;
      return { options: [], places: [], retrievalError: error.message };
    }
  }
  // Chỉ tìm quán: dùng chung bộ lọc Khám phá, từ khoá đầu tiên ("lẩu") làm ô tìm kiếm
  const filters = nearbyQuerySchema.parse({
    lat: criteria.origin.lat,
    lng: criteria.origin.lng,
    radius_km: criteria.radius_km,
    categories: criteria.categories.join(',') || undefined,
    tags: criteria.tags.join(',') || undefined,
    price_min: criteria.price_min || undefined,
    price_max: criteria.price_max ?? undefined,
    min_rating: criteria.min_rating ?? undefined,
    q: built.keywords[0],
    open_at: criteria.open_only ? criteria.start_time : undefined,
    vehicle: criteria.vehicle,
    sort: DEFAULT_PLACE_SORT,
    limit: AI_FIND_PLACES_LIMIT,
    auto_relax: 'true', // không có quán khớp hết điều kiện => nới dần, ghi chú cho người dùng biết
  });
  const found = await searchPlaces(filters);
  if (found.relaxed) built.assumptions.push(`Không có chỗ khớp hết điều kiện — đã tạm bỏ: ${found.relaxed.labels.join(', ')}`);
  const pinned = mustInclude.map((place) => toPlaceView(place)); // quán người dùng gọi tên => luôn đứng đầu
  const places = [...pinned, ...found.items.filter((item) => !pinned.some((place) => String(place.id) === String(item.id)))].slice(0, AI_FIND_PLACES_LIMIT);
  return { options: [], places, retrievalError: places.length ? null : 'Không có địa điểm nào khớp yêu cầu.' };
};

// Chỉ hỏi lại khi THẬT SỰ quá chung chung: chưa biết làm gì VÀ chưa biết đi đâu / lúc nào. LLM hay hỏi thừa
// (ngân sách, số người) => những thứ đó tự giả định và ghi chú, không bắt người dùng trả lời.
const isTooVague = ({ criteria, places_mentioned: places }) => {
  const hasActivity = criteria.categories.length || criteria.tags.length || criteria.keywords.length || criteria.sequence.length || criteria.meals.length || criteria.food_tour;
  return !hasActivity && !criteria.district && !places.length;
};

// Bước 2 — quyết định nhánh xử lý
const decide = (interpretation, askedBefore) => {
  if (interpretation.request_quality === REQUEST_QUALITY.NOT_ALLOWED) return 'refuse';
  if (interpretation.intent === AI_INTENTS.ASK_PLACE) return 'place';
  if (!PLANNING_INTENTS.includes(interpretation.intent)) return 'chat';
  if (interpretation.request_quality === REQUEST_QUALITY.NEEDS_INFO && !askedBefore && isTooVague(interpretation)) return 'clarify';
  return 'plan';
};

// Hỏi đúng 2 điều cốt lõi còn thiếu (làm gì + ở đâu) bằng câu dựng sẵn — đáp án chắc chắn hiểu được ở lượt sau
const VAGUE_QUESTIONS = questionsFor(['activity', 'area']);

/**
 * POST /api/ai/chat — 1 lượt trò chuyện.
 * @param {{ userId?, message, sessionId?, context?, origin?, tier?, hints? }} input
 */
export const chatWithPlanner = async ({ userId = null, message, sessionId = null, context = null, origin = null, tier = AI_DEFAULT_TIER, hints = null }) => {
  const { steps, run } = createTrace();
  const guarded = guardInput(message);
  if (guarded.flags.empty) throw new AppError('Bạn hãy nhập yêu cầu', HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR);

  const session = await loadSession(userId, sessionId);
  const previousCriteria = session?.criteria ?? context?.criteria ?? null;
  const previousMustVisitIds = (session ? session.must_visit_ids : context?.must_visit_ids) ?? [];
  const pending = (session ? session.pending : context?.pending) ?? null;
  const askedBefore = pending?.kind === PENDING_KINDS.CLARIFY;
  const history = toHistory(session);
  const now = vietnamNow();
  steps.push({ key: 'guard', label: 'Kiểm tra câu hỏi', ms: 0, status: 'ok', detail: guarded.flags });

  // 1. Hiểu yêu cầu (+ ghép với yêu cầu đang chờ nếu người dùng đang trả lời câu hỏi làm rõ)
  const understood = await run('interpret', 'Hiểu yêu cầu', async () => {
    const result = await interpretRequest({ text: guarded.text, flags: guarded.flags, history, previousCriteria, nowLabel: now.label, askedBefore });
    return { ...result, trace: agentTrace(result) };
  });
  const { interpretation, continued } = resolvePending(pending, applyHints(understood.interpretation, hints));
  const { intent } = interpretation;
  const branch = decide(interpretation, askedBefore || continued);

  const response = {
    intent,
    reply: '',
    request_quality: interpretation.request_quality,
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
    flags: { pii_masked: guarded.flags.pii_masked, truncated: guarded.flags.truncated, continued },
    sources: { interpreter: understood.source, advisor: 'template' },
    trace: steps,
  };
  const applyAdvice = (advice) => Object.assign(response, { reply: advice.reply, tips: advice.tips, warnings: advice.warnings, follow_up_suggestions: advice.follow_up_suggestions });
  const finish = async () => {
    response.session_id = await persistSession({ session, userId, text: guarded.text, response, tier });
    return response;
  };

  // 2a. Không được phép => từ chối lịch sự, không chạy tiếp
  if (branch === 'refuse') {
    response.refusal = { kind: 'not_allowed', reasons: [interpretation.refusal_reason].filter(Boolean), alternatives: [] };
    applyAdvice(buildRefusalReply(response.refusal));
    return finish();
  }

  // 2b. Quá chung chung => hỏi lại (đáp án hiện thành nút bấm); lượt sau ghép câu trả lời vào yêu cầu này
  if (branch === 'clarify') {
    const questions = VAGUE_QUESTIONS;
    response.clarifying_questions = questions;
    response.pending = { kind: PENDING_KINDS.CLARIFY, interpretation };
    applyAdvice(buildClarifyReply(questions));
    steps.push({ key: 'clarify', label: 'Hỏi lại cho rõ', ms: 0, status: 'ok', detail: { questions: questions.length } });
    return finish();
  }

  // 2c. Hỏi về 1 địa điểm
  if (branch === 'place') {
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

  // 3–5. Chuẩn hoá → kiểm tra khả thi → truy vấn
  let built = null;
  let retrieved = { options: [], places: [], retrievalError: null };
  if (branch === 'plan') {
    built = await run('criteria', 'Chuẩn hoá tiêu chí', async () => {
      const result = await buildCriteria({ interpretation, previousCriteria, previousMustVisitIds, clientOrigin: origin, now });
      return { ...result, keywords: interpretation.criteria.keywords, trace: { status: 'ok', detail: { assumptions: result.assumptions.length, must_visit: result.mustInclude.length } } };
    });
    response.understood = {
      criteria: built.criteria,
      assumptions: built.assumptions,
      must_visit: built.mustInclude.map((place) => ({ id: place._id, name: place.name })),
      avoided: built.exclude.map((place) => ({ id: place._id, name: place.name })),
    };

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

    retrieved = await run('retrieve', AI_TRIP_INTENTS.includes(intent) ? 'Lên lộ trình từ dữ liệu thật' : 'Tìm địa điểm', async () => {
      const result = await retrieve({ intent, built });
      return { ...result, trace: { status: result.retrievalError ? 'empty' : 'ok', detail: { options: result.options.length, places: result.places.length, candidates: result.candidateCount ?? null } } };
    });
    if (retrieved.options.length && WEATHER_HINTS.includes(interpretation.criteria.date_hint)) {
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
      options: retrieved.options,
      places: retrieved.places,
      weather: response.weather,
      refusalReason: intent === AI_INTENTS.OUT_OF_SCOPE ? interpretation.refusal_reason : null,
      retrievalError: retrieved.retrievalError,
      history,
    });
    return { ...result, trace: agentTrace(result) };
  });

  const { advice } = advised;
  const notes = new Map(advice.option_notes.map((note) => [note.option_key, note]));
  applyAdvice(advice);
  response.sources.advisor = advised.source;
  response.options = retrieved.options.map((option) => ({ ...option, ai_note: notes.get(option.key) ?? null }));
  response.places = retrieved.places.map((place) => ({ ...place, ai_recommended: advice.recommended_place_ids.includes(String(place.id)) }));
  return finish();
};
