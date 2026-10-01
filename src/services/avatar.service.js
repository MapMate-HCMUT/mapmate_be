import { AVATAR_MAX_BYTES } from '../constants/auth.js';
import { ERROR_CODES, PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { UserAvatar } from '../models/userAvatar.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { clearLeaderboardCache } from './leaderboard.service.js';

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// Kiểm tra "chữ ký" đầu file để chắc chắn đúng là ảnh, không tin vào mime client gửi lên.
const MAGIC_BYTES = {
  'image/jpeg': (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buf) => buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
};

const invalidImage = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.INVALID_IMAGE);

const parseImageDataUrl = (dataUrl) => {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw invalidImage('Ảnh phải là JPG, PNG hoặc WEBP');
  const [, mimeType, base64] = match;
  const data = Buffer.from(base64, 'base64');
  if (data.length > AVATAR_MAX_BYTES) throw invalidImage(`Ảnh quá lớn (tối đa ${AVATAR_MAX_BYTES / 1024}KB)`);
  if (!MAGIC_BYTES[mimeType](data)) throw invalidImage('File không phải ảnh hợp lệ');
  return { mimeType, data };
};

const setAvatarUrl = async (userId, avatarUrl) => {
  const user = await User.findByIdAndUpdate(userId, { $set: { avatar_url: avatarUrl } }, { returnDocument: 'after' }).lean();
  if (!user) throw new AppError('Không tìm thấy người dùng', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
  clearLeaderboardCache();
  return user;
};

// PUT /api/users/me/avatar — lưu ảnh vào MongoDB, avatar_url có ?v= để trình duyệt cache lâu dài mà vẫn thấy ảnh mới.
export const saveUploadedAvatar = async (userId, dataUrl) => {
  const { mimeType, data } = parseImageDataUrl(dataUrl);
  await UserAvatar.findOneAndUpdate(
    { user_id: userId },
    { $set: { mime_type: mimeType, data, size: data.length, updated_at: new Date() } },
    { upsert: true },
  );
  return setAvatarUrl(userId, `/api/users/${userId}/avatar?v=${Date.now()}`);
};

// DELETE /api/users/me/avatar — quay về avatar chữ cái đầu.
export const removeAvatar = async (userId) => {
  await UserAvatar.deleteOne({ user_id: userId });
  return setAvatarUrl(userId, null);
};

// GET /api/users/:id/avatar
export const getAvatarFile = async (userId) => {
  const avatar = await UserAvatar.findOne({ user_id: userId }, { mime_type: 1, data: 1 }).lean();
  if (!avatar) throw new AppError('Người dùng chưa có ảnh đại diện', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
  return { mimeType: avatar.mime_type, data: Buffer.from(avatar.data.buffer ?? avatar.data) };
};
