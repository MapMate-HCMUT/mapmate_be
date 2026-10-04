import { AI_MODEL_DEFAULTS, AI_MODEL_TIERS, GROQ_DEFAULT_BASE_URL } from '../constants/ai.js';
import { JWT_DEFAULT_EXPIRES_IN } from '../constants/auth.js';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not defined in .env`);
  return value;
};

// Đọc biến môi trường tại 1 chỗ duy nhất — các file khác import từ đây, không đọc process.env trực tiếp.
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 3000,
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || JWT_DEFAULT_EXPIRES_IN,
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()),
  // Groq (AI Planner). Không có key => AI Planner vẫn chạy bằng bộ hiểu câu dựa trên luật (chất lượng thấp hơn).
  llm: {
    apiKey: process.env.GROQ_API_KEY || null,
    baseUrl: process.env.GROQ_BASE_URL || GROQ_DEFAULT_BASE_URL,
    models: {
      [AI_MODEL_TIERS.FAST]: process.env.GROQ_MODEL_FAST || AI_MODEL_DEFAULTS[AI_MODEL_TIERS.FAST].id,
      [AI_MODEL_TIERS.SMART]: process.env.GROQ_MODEL_SMART || AI_MODEL_DEFAULTS[AI_MODEL_TIERS.SMART].id,
    },
  },
};
