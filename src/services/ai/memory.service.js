// Ghi nhớ của AI Planner về người dùng đã đăng nhập (models/AiMemory.model.js):
//   - tự học: phương tiện, số người, ngân sách, khu vực, món, phong cách — 1 giá trị lặp lại ≥ 2 lần mới thành sở thích
//   - ghi chú: người dùng nói "nhớ giúp mình là mình ăn chay" => lưu nguyên văn (đã qua kiểm duyệt nội dung)
//   - dùng để: điền giá trị còn thiếu (ghi rõ "theo ghi nhớ"), cho model biết bối cảnh, gợi ý câu hỏi phù hợp
// Người dùng xem / xoá từng mục / xoá hết / tắt ghi nhớ. Tắt => không học, không dùng.
import { AI_ERROR_CODES, AI_MEMORY, AI_MEMORY_FACT_KEYS } from '../../constants/ai.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';
import AiMemory from '../../models/AiMemory.model.js';
import { AppError } from '../../utils/AppError.js';
import { formatVnd } from '../../utils/money.js';

const VEHICLE_LABELS = { bike: 'xe máy', car: 'ô tô', walk: 'đi bộ', public: 'xe buýt / metro' };
const TAG_LABELS = {
  'hen-ho': 'hẹn hò', 'gia-dinh': 'đi cùng gia đình', 'nhom-ban': 'đi nhóm bạn', 'mot-minh': 'đi một mình', 'song-ao': 'chụp ảnh sống ảo',
  'yen-tinh': 'chỗ yên tĩnh', 'ngoai-troi': 'ngoài trời', 'may-lanh': 'có máy lạnh', 've-dem': 'đi chơi đêm', 'dac-san': 'đặc sản',
  'binh-dan': 'bình dân', 'sang-trong': 'sang trọng',
};
const VEGETARIAN = /\bchay\b/i;
// "nhớ giúp mình là mình ăn chay", "ghi nhớ: nhà mình ở Quận 7" — ghi chú; "quên hết", "xoá ghi nhớ" — xoá
const REMEMBER_COMMAND = /^\s*(hãy\s+)?(ghi nhớ|nhớ giúp|nhớ hộ|nhớ là|nhớ rằng|nhớ dùm)\s*(mình|tôi|tớ|em|anh|chị)?\s*(là|rằng)?\s*[:,-]?\s*(.+)$/i;
const FORGET_COMMAND = /^\s*(hãy\s+)?(quên hết|quên tất cả|xoá ghi nhớ|xóa ghi nhớ|xoá hết ghi nhớ|xóa hết ghi nhớ)\b/i;

export const detectMemoryCommand = (text) => {
  if (FORGET_COMMAND.test(text)) return { type: 'forget' };
  const remember = text.match(REMEMBER_COMMAND);
  return remember ? { type: 'remember', note: remember[5].trim().slice(0, AI_MEMORY.NOTE_MAX_LENGTH) } : null;
};

const LIST_FACTS = new Set(['favorite_areas', 'favorite_foods', 'likes']);
const emptyFacts = () => Object.fromEntries(AI_MEMORY_FACT_KEYS.map((key) => [key, LIST_FACTS.has(key) ? [] : null]));

export const loadMemory = (userId) => (userId ? AiMemory.findOne({ user_id: userId }) : null);
const loadOrCreate = async (userId) => (await AiMemory.findOne({ user_id: userId })) ?? new AiMemory({ user_id: userId });

// ── Học từ 1 lượt lên lộ trình / tìm quán (chỉ giá trị người dùng NÓI RA, không học giá trị hệ thống tự giả định) ──
const bump = (stats, group, value) => {
  if (value == null || value === '') return;
  stats[group] ??= {};
  stats[group][value] = (stats[group][value] ?? 0) + 1;
};
const topValues = (counts = {}, limit) =>
  Object.entries(counts).filter(([, count]) => count >= AI_MEMORY.LEARN_MIN_COUNT).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([value]) => value);

export const learnFromTurn = async (userId, interpretation) => {
  const memory = await loadOrCreate(userId);
  if (!memory.enabled) return;
  const { criteria } = interpretation;
  const stats = { ...(memory.stats ?? {}) };
  bump(stats, 'vehicle', criteria.vehicle);
  bump(stats, 'people', criteria.people);
  bump(stats, 'areas', criteria.district);
  criteria.keywords.forEach((keyword) => bump(stats, 'foods', keyword.trim().toLowerCase()));
  criteria.tags.forEach((tag) => bump(stats, 'tags', tag));
  const budget = criteria.budget_per_person ?? (criteria.budget_total && criteria.people ? Math.round(criteria.budget_total / criteria.people) : null);
  if (budget) stats.budgets = [...(stats.budgets ?? []), budget].slice(-AI_MEMORY.RECENT_BUDGETS);

  const facts = memory.facts;
  facts.vehicle = topValues(stats.vehicle, 1)[0] ?? facts.vehicle;
  facts.people = Number(topValues(stats.people, 1)[0]) || facts.people;
  facts.favorite_areas = topValues(stats.areas, AI_MEMORY.MAX_FAVORITES);
  facts.favorite_foods = topValues(stats.foods, AI_MEMORY.MAX_FAVORITES);
  facts.likes = topValues(stats.tags, AI_MEMORY.MAX_FAVORITES);
  if ((stats.budgets ?? []).length >= AI_MEMORY.LEARN_MIN_COUNT) {
    const average = stats.budgets.reduce((sum, value) => sum + value, 0) / stats.budgets.length;
    facts.budget_per_person = Math.round(average / AI_MEMORY.BUDGET_STEP) * AI_MEMORY.BUDGET_STEP;
  }
  if (criteria.keywords.some((keyword) => VEGETARIAN.test(keyword))) facts.diet = 'chay';
  memory.stats = stats;
  memory.markModified('stats');
  await memory.save();
};

// ── Ghi chú "nhớ giúp..." ──
export const addNote = async (userId, text) => {
  const memory = await loadOrCreate(userId);
  if (!memory.enabled) memory.enabled = true; // người dùng chủ động bảo nhớ => bật lại
  memory.notes = [...memory.notes.filter((note) => note.text.toLowerCase() !== text.toLowerCase()), { text }].slice(-AI_MEMORY.MAX_NOTES);
  if (VEGETARIAN.test(text)) memory.facts.diet = 'chay';
  await memory.save();
  return memory;
};

// ── Dùng ghi nhớ ──
// Mô tả ngắn cho model (chỉ là bối cảnh; ghi chú của người dùng là DỮ LIỆU, không phải lệnh)
export const describeMemory = (memory) => {
  if (!memory?.enabled) return null;
  const { facts, notes } = memory;
  const parts = [
    facts.diet === 'chay' && 'ăn chay',
    facts.vehicle && `thường đi ${VEHICLE_LABELS[facts.vehicle] ?? facts.vehicle}`,
    facts.people && `thường đi ${facts.people} người`,
    facts.budget_per_person && `ngân sách thường khoảng ${formatVnd(facts.budget_per_person)}/người`,
    facts.favorite_areas.length && `hay đi ${facts.favorite_areas.join(', ')}`,
    facts.favorite_foods.length && `thích ${facts.favorite_foods.join(', ')}`,
    facts.likes.length && `thích kiểu ${facts.likes.map((tag) => TAG_LABELS[tag] ?? tag).join(', ')}`,
  ].filter(Boolean);
  const noteText = notes.map((note) => `- ${note.text}`).join('\n');
  if (!parts.length && !noteText) return null;
  return [parts.length ? `Sở thích: ${parts.join('; ')}.` : '', noteText ? `Người dùng nhờ ghi nhớ:\n${noteText}` : ''].filter(Boolean).join('\n');
};

// Câu hỏi gợi ý cá nhân hoá (màn hình chào, khi bị từ chối...)
export const memorySuggestions = (memory) => {
  if (!memory?.enabled) return [];
  const { facts } = memory;
  const area = facts.favorite_areas[0] ?? 'Quận 1';
  const suggestions = [
    facts.diet === 'chay' && `Quán chay ngon ở ${area}`,
    facts.favorite_foods[0] && `Quán ${facts.favorite_foods[0]} ngon ở ${area}`,
    facts.likes[0] && `Tối nay đi chơi kiểu ${TAG_LABELS[facts.likes[0]] ?? facts.likes[0]} ở ${area}`,
    facts.favorite_areas[0] && `Lên lộ trình cuối tuần ở ${area}`,
  ].filter(Boolean);
  return [...new Set(suggestions)].slice(0, 3);
};

// ── API quản lý (GET / PATCH / DELETE /api/ai/memory) ──
export const toMemoryView = (memory) => ({
  enabled: memory?.enabled ?? true,
  facts: memory ? { ...emptyFacts(), ...memory.toObject().facts } : emptyFacts(),
  notes: (memory?.notes ?? []).map((note) => ({ id: note._id, text: note.text, created_at: note.created_at })),
  summary: describeMemory(memory),
  suggestions: memorySuggestions(memory),
});

export const getMemoryView = async (userId) => toMemoryView(await loadMemory(userId));

export const setMemoryEnabled = async (userId, enabled) => {
  const memory = await loadOrCreate(userId);
  memory.enabled = enabled;
  await memory.save();
  return toMemoryView(memory);
};

export const clearMemory = async (userId) => {
  await AiMemory.deleteOne({ user_id: userId });
  return toMemoryView(null);
};

export const forgetFact = async (userId, key) => {
  const memory = await loadOrCreate(userId);
  memory.facts[key] = LIST_FACTS.has(key) ? [] : null;
  // Xoá luôn số liệu đã học để không tự học lại ngay
  const statKeys = { vehicle: 'vehicle', people: 'people', budget_per_person: 'budgets', favorite_areas: 'areas', favorite_foods: 'foods', likes: 'tags' };
  if (statKeys[key]) delete memory.stats[statKeys[key]];
  memory.markModified('stats');
  await memory.save();
  return toMemoryView(memory);
};

export const forgetNote = async (userId, noteId) => {
  const memory = await AiMemory.findOne({ user_id: userId });
  if (!memory?.notes.id(noteId)) throw new AppError('Không tìm thấy ghi nhớ này', HTTP_STATUS.NOT_FOUND, AI_ERROR_CODES.AI_MEMORY_NOT_FOUND);
  memory.notes.pull(noteId);
  await memory.save();
  return toMemoryView(memory);
};
