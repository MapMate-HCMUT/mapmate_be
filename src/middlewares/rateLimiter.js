import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { AI_RATE_LIMIT } from '../constants/ai.js';
import { AUTH_RATE_LIMIT } from '../constants/auth.js';
import { SOCIAL_WRITE_RATE_LIMIT } from '../constants/social.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { RATE_LIMITS } from '../constants/rateLimits.js';
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

// Mỗi lượt AI tốn tiền gọi Groq => 20 lượt / 10 phút / IP.
export const aiRateLimiter = rateLimit({
  windowMs: AI_RATE_LIMIT.WINDOW_MS,
  limit: AI_RATE_LIMIT.MAX_REQUESTS,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(new AppError('Bạn hỏi AI hơi nhiều, nghỉ tay vài phút rồi thử lại nhé', HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS)),
});

// Đã đăng nhập => đếm theo tài khoản (nhiều người chung 1 wifi không bị chặn lẫn nhau); khách => theo IP.
const userOrIpKey = (req) => (req.user?.id ? `user:${req.user.id}` : ipKeyGenerator(req.ip));

const createLimiter = ({ WINDOW_MS, MAX_REQUESTS }, message) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_REQUESTS,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
    handler: (_req, _res, next) => next(new AppError(message, HTTP_STATUS.TOO_MANY_REQUESTS, ERROR_CODES.TOO_MANY_REQUESTS)),
  });

// Tầng ngoài cùng cho mọi /api — chặn script gọi liên tục làm sập server
export const globalRateLimiter = createLimiter(RATE_LIMITS.GLOBAL, 'Bạn gửi quá nhiều yêu cầu, vui lòng chậm lại một chút');
export const placeSearchRateLimiter = createLimiter(RATE_LIMITS.PLACE_SEARCH, 'Bạn tìm kiếm hơi nhanh, đợi vài giây rồi thử lại nhé');
export const routeComputeRateLimiter = createLimiter(RATE_LIMITS.ROUTE_COMPUTE, 'Bạn tính lộ trình quá nhiều lần, đợi một chút rồi thử lại nhé');
export const voiceRateLimiter = createLimiter(RATE_LIMITS.VOICE, 'Bạn dùng giọng nói hơi nhiều, nghỉ vài phút rồi thử lại nhé');
export const transitRateLimiter = createLimiter(RATE_LIMITS.TRANSIT, 'Bạn tra cứu xe buýt hơi nhanh, đợi một chút rồi thử lại nhé');
export const mediaUploadRateLimiter = createLimiter(RATE_LIMITS.MEDIA_UPLOAD, 'Bạn tải ảnh / video hơi nhiều, nghỉ vài phút rồi thử lại nhé');
