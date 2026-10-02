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
};
