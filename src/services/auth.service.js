import bcrypt from 'bcryptjs';
import { BCRYPT_ROUNDS } from '../constants/auth.js';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/jwt.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import { notifyUser } from './notification.service.js';
import { toPublicProfile } from './user.service.js';

// Hash giả để so sánh khi email không tồn tại => thời gian phản hồi như nhau, không lộ email nào đã đăng ký.
const dummyHashPromise = bcrypt.hash('mapmate-timing-guard', BCRYPT_ROUNDS);

export const registerUser = async ({ email, password, username }) => {
  // Trùng email/username sẽ bị unique index chặn => errorHandler trả 409 EMAIL_TAKEN / USERNAME_TAKEN.
  const user = await User.create({ email, password, username });
  await notifyUser(user._id, {
    type: NOTIFICATION_TYPES.WELCOME,
    icon: '👋',
    title: `Chào mừng ${user.username} đến với MapMate!`,
    body: 'Khám phá bản đồ, check-in địa điểm và báo cáo điểm ngập để nhận XP nhé.',
    link: '/',
  });
  return { userId: user._id, token: signAccessToken(user._id), user: toPublicProfile(user) };
};

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({ email }).select('+password');
  const isValid = user ? await user.comparePassword(password) : await bcrypt.compare(password, await dummyHashPromise);

  if (!user || !isValid) {
    throw new AppError('Email hoặc mật khẩu không đúng', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS);
  }
  return { token: signAccessToken(user._id), user: toPublicProfile(user) };
};
