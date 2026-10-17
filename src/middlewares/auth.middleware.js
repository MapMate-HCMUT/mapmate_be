import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { USER_ROLES } from '../constants/business.js';
import { getSessionRole } from '../services/session.service.js';

const BEARER_PREFIX = 'Bearer ';

const extractToken = (req) => {
  const header = req.headers.authorization;
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length).trim() : null;
};

const decodeUser = async (token) => {
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
  const role = await getSessionRole(payload.sub, payload.ver);
  if (!role) {
    throw new AppError('Phiên đăng nhập đã kết thúc, vui lòng đăng nhập lại', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_INVALID);
  }
  return { id: payload.sub, role };
};

// Bắt buộc đăng nhập: gắn req.user = { id, role }.
export const requireAuth = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Bạn cần đăng nhập', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_MISSING);
  req.user = await decodeUser(token);
  next();
};

// Không bắt buộc: có token hợp lệ thì gắn req.user, không có thì bỏ qua (VD: leaderboard công khai).
export const optionalAuth = async (req, _res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await decodeUser(token);
    } catch {
      req.user = undefined;
    }
  }
  next();
};

// Chỉ dành cho thành viên (đăng nhập Google) — tài khoản khách bị chặn. Đặt SAU requireAuth (VD: mọi tính năng AI).
export const requireMember = (req, _res, next) => {
  if (req.user?.role === USER_ROLES.GUEST) {
    throw new AppError('Tài khoản khách không dùng được tính năng này — hãy đăng nhập bằng Google', HTTP_STATUS.FORBIDDEN, ERROR_CODES.GUEST_NOT_ALLOWED);
  }
  next();
};
