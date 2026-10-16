import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { isSessionCurrent } from '../services/session.service.js';

const BEARER_PREFIX = 'Bearer ';

const extractToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
};

const decodeUserId = async (token) => {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (error) {
    const isExpired = error instanceof jwt.TokenExpiredError;
    throw new AppError(
      isExpired ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' : 'Token không hợp lệ',
      HTTP_STATUS.UNAUTHORIZED,
      isExpired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID,
    );
  }
  // Đã đổi mật khẩu / đăng xuất mọi thiết bị / tài khoản không còn => token cũ không dùng được nữa
  if (!(await isSessionCurrent(payload.sub, payload.ver))) {
    throw new AppError('Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID);
  }
  return payload.sub;
};

// Bắt buộc đăng nhập: gắn req.user = { id }.
export const requireAuth = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Bạn cần đăng nhập', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_MISSING);
  req.user = { id: await decodeUserId(token) };
  next();
};

// Không bắt buộc: có token hợp lệ thì gắn req.user, không có thì bỏ qua (VD: leaderboard công khai).
export const optionalAuth = async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = { id: await decodeUserId(token) };
    } catch {
      req.user = undefined;
    }
  }
  next();
};
