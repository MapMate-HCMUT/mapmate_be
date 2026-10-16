import { HTTP_STATUS } from '../constants/httpStatus.js';
import { revokeSessions } from '../services/session.service.js';
import { googleLoginUser, loginUser, registerUser } from '../services/auth.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const register = asyncHandler(async (req, res) => {
  const data = await registerUser(req.validated.body);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đăng ký tài khoản thành công', data });
});

export const login = asyncHandler(async (req, res) => {
  const data = await loginUser(req.validated.body);
  return sendSuccess(res, { message: 'Đăng nhập thành công', data });
});

export const googleLogin = asyncHandler(async (req, res) => {
  const data = await googleLoginUser(req.body);
  return sendSuccess(res, { message: 'Đăng nhập Google thành công', data });
});

// Đăng xuất khỏi MỌI thiết bị (kể cả thiết bị này) — mọi token đã cấp hết hiệu lực
export const logoutAll = asyncHandler(async (req, res) => {
  await revokeSessions(req.user.id);
  return sendSuccess(res, { message: 'Đã đăng xuất khỏi mọi thiết bị' });
});
