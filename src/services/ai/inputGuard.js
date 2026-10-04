// Agent 0 — Bộ lọc đầu vào (không dùng LLM, chạy trước mọi thứ):
// người dùng gõ gì cũng được, nhưng trước khi gửi ra ngoài (Groq) phải: làm sạch, cắt độ dài, che thông tin cá nhân,
// và đánh dấu câu có dấu hiệu "prompt injection" (cố bắt AI bỏ vai trò). Câu vẫn được xử lý — chỉ là AI được nhắc
// coi nó là dữ liệu, và kết quả luôn bị khoá bởi schema + dữ liệu thật trong DB nên không thể làm gì ngoài lên lộ trình.
import { AI_PROMPT_MAX_LENGTH } from '../../constants/ai.js';

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\u2060\uFEFF]/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}\b/g;
const INJECTION_PATTERNS = [
  /ignore (all |any )?(previous|above|prior) (instructions|prompts?)/i,
  /(system|developer) prompt/i,
  /you are now|act as|pretend to be|jailbreak|DAN\b/i,
  /bỏ qua (mọi |tất cả )?(hướng dẫn|chỉ dẫn|lệnh)/i,
  /(tiết lộ|cho xem|in ra).{0,20}(prompt|hướng dẫn hệ thống|api key|khoá|khóa)/i,
  /\bapi[_ -]?key\b|GROQ_API_KEY|XAI_API_KEY|process\.env/i,
];

export const guardInput = (raw) => {
  const cleaned = String(raw ?? '').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
  const truncated = cleaned.length > AI_PROMPT_MAX_LENGTH;
  const text = cleaned.slice(0, AI_PROMPT_MAX_LENGTH);
  // Che email / SĐT trước khi gửi cho bên thứ ba — không cần cho việc lên lộ trình.
  const masked = text.replace(EMAIL, '[email]').replace(PHONE, '[số điện thoại]');
  return {
    text: masked,
    flags: {
      empty: masked.length === 0,
      truncated,
      pii_masked: masked !== text,
      injection_suspected: INJECTION_PATTERNS.some((pattern) => pattern.test(text)),
    },
  };
};
