import { AI_MODEL_DEFAULTS, AI_MODEL_TIERS, GROQ_DEFAULT_BASE_URL } from '../constants/ai.js';
import { JWT_DEFAULT_EXPIRES_IN } from '../constants/auth.js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not defined in .env`);
  return value;
};

// Đọc biến môi trường tại 1 chỗ duy nhất — các file khác import từ đây, không đọc process.env trực tiếp.
// GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3... theo đúng thứ tự số, bỏ ô trống / trùng
const groqApiKeys = () => [
  ...new Set(
    Object.keys(process.env)
      .filter((name) => /^GROQ_API_KEY(_\d+)?$/.test(name))
      .sort((a, b) => Number(a.split('_')[3] ?? 1) - Number(b.split('_')[3] ?? 1))
      .map((name) => process.env[name]?.trim())
      .filter(Boolean),
  ),
];

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  // Chỉ chi tiết lỗi (stack) khi CHẮC CHẮN đang chạy dev — quên đặt NODE_ENV lúc deploy cũng không lộ stack ra ngoài
  isDevelopment: process.env.NODE_ENV === 'development',
  port: Number(process.env.PORT) || 3000,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || JWT_DEFAULT_EXPIRES_IN,
  trustProxy: Number(process.env.TRUST_PROXY) || 0, // số tầng proxy phía trước (0 = chạy trực tiếp)
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()),
  // Groq (AI Planner). Không có key => AI Planner vẫn chạy bằng bộ hiểu câu dựa trên luật (chất lượng thấp hơn).
  // Cloudinary (ảnh / video người dùng đăng kèm bài viết, đánh giá). Thiếu 1 trong 3 biến => tắt đính kèm ảnh / video.
  cloudinary: process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
    ? { cloudName: process.env.CLOUDINARY_CLOUD_NAME, apiKey: process.env.CLOUDINARY_API_KEY, apiSecret: process.env.CLOUDINARY_API_SECRET }
    : null,
  // Goong REST (tìm địa chỉ, chỉ đường) — key CHỈ nằm ở server; trình duyệt gọi qua /api/geo (routes/geo.routes.js)
  goong: { apiKey: process.env.GOONG_API_KEY || null },
  llm: {
    apiKey: groqApiKeys()[0] ?? null,
    // Nhiều key (mỗi key 1 tài khoản Groq => hạn mức riêng): GROQ_API_KEY, GROQ_API_KEY_2, GROQ_API_KEY_3...
    // 1 key hết hạn mức (429) => tự chuyển key khác (services/ai/llmClient.js)
    apiKeys: groqApiKeys(),
    baseUrl: process.env.GROQ_BASE_URL || GROQ_DEFAULT_BASE_URL,
    models: {
      [AI_MODEL_TIERS.FAST]: process.env.GROQ_MODEL_FAST || AI_MODEL_DEFAULTS[AI_MODEL_TIERS.FAST].id,
      [AI_MODEL_TIERS.SMART]: process.env.GROQ_MODEL_SMART || AI_MODEL_DEFAULTS[AI_MODEL_TIERS.SMART].id,
    },
  },
};
