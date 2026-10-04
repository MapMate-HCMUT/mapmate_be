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

export const googleLoginUser = async ({ credential, email, name, picture, google_id }) => {
  let googleEmail = email;
  let googleName = name;
  let googleAvatar = picture;
  let googleSub = google_id;

  if (credential) {
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        googleEmail = payload.email || googleEmail;
        googleName = payload.name || payload.given_name || googleName;
        googleAvatar = payload.picture || googleAvatar;
        googleSub = payload.sub || googleSub;
      }
    } catch {
      // ignore decode error
    }
  }

  if (!googleEmail) {
    throw new AppError('Không tìm thấy thông tin email từ tài khoản Google', HTTP_STATUS.BAD_REQUEST);
  }

  let user = await User.findOne({ email: googleEmail.toLowerCase() });
  if (!user) {
    // Chuẩn hóa tên bỏ dấu tiếng Việt, đảm bảo tối thiểu 3 ký tự
    const cleanName = (googleName || googleEmail.split('@')[0])
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .trim();

    let baseUsername = cleanName.length >= 3 ? cleanName.slice(0, 15) : `user_${cleanName}`.slice(0, 15);
    if (baseUsername.length < 3) baseUsername = `user_${Date.now().toString().slice(-4)}`;

    let username = baseUsername;
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${baseUsername.slice(0, 11)}_${counter++}`;
    }

    user = await User.create({
      email: googleEmail.toLowerCase(),
      username,
      avatar_url: googleAvatar || null,
      google_id: googleSub || null,
      password: null,
    });

    await notifyUser(user._id, {
      type: NOTIFICATION_TYPES.WELCOME,
      icon: '👋',
      title: `Chào mừng ${user.username} đến với MapMate!`,
      body: 'Khám phá bản đồ, check-in địa điểm và lập lộ trình cùng AI nhé.',
      link: '/',
    });
  } else {
    if (!user.avatar_url && googleAvatar) {
      user.avatar_url = googleAvatar;
      await user.save();
    }
  }

  return { token: signAccessToken(user._id), user: toPublicProfile(user) };
};
