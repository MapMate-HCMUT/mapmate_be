// Phiên trò chuyện AI Planner (chỉ người đã đăng nhập): nạp / lưu / liệt kê / xoá.
import { AI_ERROR_CODES, AI_HISTORY_TURNS, AI_SESSION_LIST_LIMIT, AI_SESSION_TITLE_LENGTH } from '../../constants/ai.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import AiSession from '../../models/AiSession.model.js';
import { AppError } from '../../utils/AppError.js';

const sessionNotFound = () => new AppError('Không tìm thấy cuộc trò chuyện', HTTP_STATUS.NOT_FOUND, AI_ERROR_CODES.AI_SESSION_NOT_FOUND);

export const loadSession = async (userId, sessionId) => {
  if (!userId || !sessionId) return null;
  const session = await AiSession.findOne({ _id: sessionId, user_id: userId });
  if (!session) throw sessionNotFound();
  return session;
};

// Lịch sử gần nhất (chỉ phần chữ) để model nhớ ngữ cảnh "rẻ hơn", "thêm cà phê"...
export const toHistory = (session) =>
  (session?.messages ?? []).slice(-AI_HISTORY_TURNS * 2).map((message) => {
    if (message.role === 'user') return { role: 'user', content: message.content };
    try {
      return { role: 'assistant', content: JSON.parse(message.content).reply ?? '' };
    } catch {
      return { role: 'assistant', content: message.content };
    }
  });

// Phần trả lời được lưu để mở lại phiên vẫn thấy câu hỏi làm rõ / lời từ chối / thông tin địa điểm
const toStoredMessage = (response) => ({
  reply: response.reply,
  intent: response.intent,
  option_keys: response.options.map((option) => option.key),
  place_ids: response.places.map((place) => String(place.id)),
  clarifying_questions: response.clarifying_questions,
  refusal: response.refusal,
  place_answer: response.place_answer && {
    place: response.place_answer.place && { id: response.place_answer.place.id, name: response.place_answer.place.name },
    wikipedia: response.place_answer.wikipedia,
    weather: response.place_answer.weather,
    facts_used: response.place_answer.facts_used,
  },
  weather: response.weather,
});

export const persistSession = async ({ session, userId, text, response, tier }) => {
  if (!userId) return null;
  const doc = session ?? new AiSession({ user_id: userId, title: text.slice(0, AI_SESSION_TITLE_LENGTH) });
  doc.messages.push({ role: 'user', content: text }, { role: 'model', content: JSON.stringify(toStoredMessage(response)) });
  if (response.understood?.criteria) {
    doc.criteria = response.understood.criteria;
    doc.context = { budget: response.understood.criteria.trip_budget ?? 0, vehicle: response.understood.criteria.vehicle }; // Milestone 2: AI_SESSIONS.context
    doc.must_visit_ids = response.understood.must_visit.map((place) => place.id);
  }
  doc.pending = response.pending;
  doc.last_intent = response.intent;
  doc.model_tier = tier;
  doc.markModified('criteria');
  doc.markModified('pending');
  await doc.save();
  return doc._id;
};

export const listSessions = async (userId) => {
  const sessions = await AiSession.find({ user_id: userId }, { title: 1, last_intent: 1, updated_at: 1, created_at: 1, messages: { $slice: -1 } })
    .sort({ updated_at: -1 })
    .limit(AI_SESSION_LIST_LIMIT)
    .lean();
  return sessions.map((session) => ({ id: session._id, title: session.title, last_intent: session.last_intent, updated_at: session.updated_at, created_at: session.created_at }));
};

const safeParse = (content) => {
  try {
    return JSON.parse(content);
  } catch {
    return { reply: content };
  }
};

export const getSession = async (userId, sessionId) => {
  const session = await AiSession.findOne({ _id: sessionId, user_id: userId }).lean();
  if (!session) throw sessionNotFound();
  return {
    id: session._id,
    title: session.title,
    criteria: session.criteria,
    pending: session.pending ?? null,
    created_at: session.created_at,
    updated_at: session.updated_at,
    messages: session.messages.map((message) => ({
      id: message._id,
      role: message.role,
      timestamp: message.timestamp,
      ...(message.role === 'user' ? { content: message.content } : safeParse(message.content)),
    })),
  };
};

export const deleteSession = async (userId, sessionId) => {
  const { deletedCount } = await AiSession.deleteOne({ _id: sessionId, user_id: userId });
  if (!deletedCount) throw sessionNotFound();
};
