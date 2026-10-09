// AI Planner (Milestone 2 — mục 3.3, đổi nhà cung cấp từ Gemini sang Groq — model mã nguồn mở, chạy rất nhanh).
// Luồng: Bộ lọc đầu vào → Agent hiểu yêu cầu (LLM nhanh) → Chuẩn hoá & neo vào DB → Lên lộ trình (thuật toán sẵn có)
//        → Agent tư vấn (LLM chính) → Kiểm tra bám dữ liệu thật. Xem services/ai/aiPlanner.service.js.

export const GROQ_DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

// Model người dùng được chọn ở giao diện. Đổi id qua .env (GROQ_MODEL_FAST / GROQ_MODEL_SMART).
// Chỉ các model gpt-oss hỗ trợ structured outputs chế độ strict trên Groq (console.groq.com/docs/structured-outputs).
export const AI_MODEL_TIERS = {
  FAST: 'fast',
  SMART: 'smart',
};
export const AI_MODEL_DEFAULTS = {
  [AI_MODEL_TIERS.FAST]: { id: 'openai/gpt-oss-20b', label: 'Nhanh', description: 'Trả lời nhanh, tiết kiệm' },
  [AI_MODEL_TIERS.SMART]: { id: 'openai/gpt-oss-120b', label: 'Thông minh', description: 'Tư vấn kỹ hơn, chậm hơn một chút' },
};
export const AI_DEFAULT_TIER = AI_MODEL_TIERS.SMART;
// Agent "hiểu yêu cầu" luôn dùng model nhanh: chỉ trích tiêu chí, không cần văn hay.
export const AI_INTERPRETER_TIER = AI_MODEL_TIERS.FAST;

export const AI_LLM_TIMEOUT_MS = 30000;
export const AI_LLM_MAX_RETRIES = 1; // thử lại 1 lần khi Groq bận (429 / 5xx) hoặc output sai schema
export const AI_LLM_RETRY_DELAY_MS = 1200;
// Hiểu yêu cầu phải chính xác (0). Lời tư vấn được phép đa dạng câu chữ (lộ trình đa dạng là do bộ xếp lộ trình bốc thăm, không phải LLM).
export const AI_TEMPERATURE = { interpreter: 0, advisor: 0.8 };
// gpt-oss là model suy luận: phần "nghĩ" cũng tính vào giới hạn token => để rộng, và giới hạn độ suy luận cho nhanh.
export const AI_MAX_OUTPUT_TOKENS = { interpreter: 2500, advisor: 3500 };
export const AI_REASONING_EFFORT = { interpreter: 'low', advisor: 'medium' };

// Người dùng gõ gì cũng được (không bắt theo mẫu), chỉ giới hạn độ dài để chống lạm dụng.
export const AI_PROMPT_MAX_LENGTH = 1000;
export const AI_HISTORY_TURNS = 6; // số lượt hội thoại gần nhất gửi kèm để nhớ ngữ cảnh
export const AI_SESSION_LIST_LIMIT = 20;
export const AI_SESSION_TITLE_LENGTH = 60;
export const AI_RATE_LIMIT = { WINDOW_MS: 10 * 60 * 1000, MAX_REQUESTS: 20 };

// Ý định của 1 câu nhắn — quyết định pipeline chạy tiếp những bước nào.
export const AI_INTENTS = {
  PLAN_TRIP: 'plan_trip', // lên lộ trình mới
  REFINE_TRIP: 'refine_trip', // sửa lộ trình đang có ("rẻ hơn", "bỏ quán cà phê")
  FIND_PLACES: 'find_places', // chỉ tìm địa điểm ("quán lẩu nào ngon gần đây")
  ASK_PLACE: 'ask_place', // hỏi về 1 địa điểm cụ thể ("Dinh Độc Lập mở cửa mấy giờ?")
  ASK_INFO: 'ask_info', // hỏi thông tin / mẹo đi lại
  SMALLTALK: 'smalltalk',
  OUT_OF_SCOPE: 'out_of_scope', // ngoài phạm vi đi chơi TP.HCM
};
export const AI_INTENT_VALUES = Object.values(AI_INTENTS);
export const AI_TRIP_INTENTS = [AI_INTENTS.PLAN_TRIP, AI_INTENTS.REFINE_TRIP];

// Đánh giá chất lượng yêu cầu (Agent hiểu yêu cầu) — quyết định hỏi lại / từ chối / làm tiếp
export const REQUEST_QUALITY = {
  OK: 'ok',
  NEEDS_INFO: 'needs_info', // thiếu nhiều thông tin hoặc mâu thuẫn => hỏi lại
  UNREALISTIC: 'unrealistic', // phi thực tế (ngân sách / thời gian không thể) => giải thích + phương án gần nhất
  NOT_ALLOWED: 'not_allowed', // phạm pháp, nguy hiểm, người lớn, cờ bạc, xúc phạm => từ chối
};
export const MISSING_INFO = ['area', 'budget', 'people', 'time', 'activity'];
export const PLACE_QUESTION_TOPICS = ['hours', 'price', 'address', 'contact', 'about', 'rating', 'weather', 'directions', 'other'];
export const AI_MAX_CLARIFYING_QUESTIONS = 2;

// Vai trò của địa điểm người dùng nhắc tới bằng tên.
export const AI_PLACE_ROLES = {
  MUST_VISIT: 'must_visit', // "phải ghé Bến Thành"
  ORIGIN: 'origin', // "xuất phát từ Landmark 81"
  NEAR: 'near', // "quanh khu Thảo Điền"
  AVOID: 'avoid', // "đừng đưa vào Bùi Viện"
};
export const AI_MAX_MUST_VISIT = 4;
// Nhớ các nơi vừa gợi ý ở vài lượt gần nhất => lượt sau hạn chế lặp lại ("gợi ý khác đi")
export const AI_RECENT_SUGGESTION_TURNS = 3;
export const AI_RECENT_PLACES_MAX = 60;
// Phương tiện người dùng hay nói: xe máy / ô tô / đi bộ / phương tiện công cộng
export const AI_VEHICLE_VALUES = ['bike', 'car', 'walk', 'public'];
export const AI_FIND_PLACES_LIMIT = 6;
// Khoảng cách tối đa (km) khi tìm địa điểm người dùng gọi tên — tên trùng nhiều chi nhánh thì lấy nơi gần nhất.
export const AI_PLACE_LOOKUP_RADIUS_KM = 20;

export const AI_ERROR_CODES = {
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_SESSION_NOT_FOUND: 'AI_SESSION_NOT_FOUND',
  AI_MEMORY_NOT_FOUND: 'AI_MEMORY_NOT_FOUND',
  VOICE_UNSUPPORTED: 'VOICE_UNSUPPORTED',
  VOICE_EMPTY: 'VOICE_EMPTY',
};

// Câu mẫu gợi ý trên giao diện
export const AI_EXAMPLE_PROMPTS = [
  'Tối nay 2 người đi hẹn hò ở Quận 1, khoảng 500k/người, đi xe máy',
  'Cuối tuần cả nhà có 2 bé, muốn đi công viên rồi ăn tối, ngân sách 1 triệu',
  'Mình đang ở Landmark 81, muốn đi cà phê yên tĩnh làm việc chiều nay',
  'Nhóm 5 đứa sinh viên, đi chơi đêm ở Quận 4 ăn ốc, rẻ thôi',
];

// Ghi nhớ của AI về người dùng (đã đăng nhập) — services/ai/memory.service.js. Người dùng xem / xoá / tắt được bất cứ lúc nào.
export const AI_MEMORY = {
  LEARN_MIN_COUNT: 2, // 1 giá trị phải lặp lại ≥ 2 lần mới thành "sở thích" (tránh ghi nhớ nhầm từ 1 lần nói)
  MAX_NOTES: 10,
  NOTE_MAX_LENGTH: 120,
  MAX_FAVORITES: 3,
  BUDGET_STEP: 50000,
  RECENT_BUDGETS: 5,
};
// Các mục người dùng xoá riêng được
export const AI_MEMORY_FACT_KEYS = ['vehicle', 'people', 'budget_per_person', 'diet', 'favorite_areas', 'favorite_foods', 'likes'];

// Nhận dạng giọng nói (ô tìm kiếm + AI Planner) — Groq Whisper: miễn phí, tự nhận tiếng Việt / tiếng Anh (kể cả nói xen kẽ).
export const VOICE = {
  MODEL: 'whisper-large-v3-turbo',
  MAX_BYTES: 4 * 1024 * 1024, // ~4 phút webm/opus — giao diện tự dừng sau 20 giây
  MIME_TYPES: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/m4a', 'audio/x-m4a'],
  TIMEOUT_MS: 20000,
  LANGUAGES: ['vi', 'en'],
};
