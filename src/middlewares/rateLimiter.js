import { rateLimit } from 'express-rate-limit';
import { AUTH_RATE_LIMIT } from '../constants/auth.js';
import { SOCIAL_WRITE_RATE_LIMIT } from '../constants/social.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

// Chặn dò mật khẩu: tối đa 20 lần đăng nhập/đăng ký mỗi 15 phút cho 1 IP.
export const authRateLimiter = rateLimit({
  windowMs: AUTH_RATE_LIMIT.WINDOW_MS,
  limit: AUTH_RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút', HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS)),
});

// Nominatim cho phép ~1 request/giây cho cả app => giới hạn mỗi người 10 lần / 10 phút.
export const geocodeRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('Bạn đã lấy vị trí quá nhiều lần, vui lòng thử lại sau', HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS)),
});

// Chống spam cho thao tác ghi của mạng xã hội (đăng bài, kết bạn, gửi chia sẻ...): 60 lần / 10 phút / IP.
export const socialWriteRateLimiter = rateLimit({
  windowMs: SOCIAL_WRITE_RATE_LIMIT.WINDOW_MS,
  limit: SOCIAL_WRITE_RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút', HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS)),
});
