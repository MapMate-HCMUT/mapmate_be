import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

const BEARER_PREFIX = 'Bearer ';

const extractToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
};

const decodeUserId = (token) => {
  try {
    return verifyAccessToken(token).sub;
  } catch (error) {
    const isExpired = error instanceof jwt.TokenExpiredError;
    throw new AppError(
      isExpired ? 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại' : 'Token không hợp lệ',
      HTTP_STATUS.UNAUTHORIZED,
      isExpired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.TOKEN_INVALID,
    );
  }
};

// Bắt buộc đăng nhập: gắn req.user = { id }.
export const requireAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Bạn cần đăng nhập', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_MISSING);
  req.user = { id: decodeUserId(token) };
  next();
};

// Không bắt buộc: có token hợp lệ thì gắn req.user, không có thì bỏ qua (VD: leaderboard công khai).
export const optionalAuth = (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = { id: decodeUserId(token) };
    } catch {
      req.user = undefined;
    }
  }
  next();
};
