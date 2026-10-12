import { AVATAR_MAX_BYTES, COVER_MAX_BYTES } from '../constants/auth.js';
import { ERROR_CODES, PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { UserAvatar } from '../models/userAvatar.model.js';
import { UserCover } from '../models/userCover.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { clearLeaderboardCache } from './leaderboard.service.js';

// Ảnh hồ sơ người dùng tự tải lên (ảnh đại diện, ảnh bìa): lưu trong MongoDB, phục vụ qua /api/users/:id/<kind>.
const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

// Kiểm tra "chữ ký" đầu file để chắc chắn đúng là ảnh, không tin vào mime client gửi lên.
const MAGIC_BYTES = {
  'image/jpeg': (buf) => buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  'image/png': (buf) => buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (buf) => buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP',
};

const invalidImage = (message) => new AppError(message, HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.INVALID_IMAGE);

export const parseImageDataUrl = (dataUrl, maxBytes = AVATAR_MAX_BYTES) => {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) throw invalidImage('Ảnh phải là JPG, PNG hoặc WEBP');
  const [, mimeType, base64] = match;
  const data = Buffer.from(base64, 'base64');
  if (data.length > maxBytes) throw invalidImage(`Ảnh quá lớn (tối đa ${Math.round(maxBytes / 1024)}KB)`);
  if (!MAGIC_BYTES[mimeType](data)) throw invalidImage('File không phải ảnh hợp lệ');
  return { mimeType, data };
};

const IMAGE_KINDS = {
  avatar: { Model: UserAvatar, field: 'avatar_url', maxBytes: AVATAR_MAX_BYTES, missing: 'Người dùng chưa có ảnh đại diện' },
  cover: { Model: UserCover, field: 'cover_url', maxBytes: COVER_MAX_BYTES, missing: 'Người dùng chưa có ảnh bìa' },
};

const setImageUrl = async (userId, field, url) => {
  const user = await User.findByIdAndUpdate(userId, { $set: { [field]: url } }, { returnDocument: 'after' }).lean();
  if (!user) throw new AppError('Không tìm thấy người dùng', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
  if (field === 'avatar_url') clearLeaderboardCache(); // bảng xếp hạng có hiện ảnh đại diện
  return user;
};

// URL có ?v= để trình duyệt cache lâu dài mà vẫn thấy ảnh mới.
const saveImage = async (kind, userId, dataUrl) => {
  const { Model, field, maxBytes } = IMAGE_KINDS[kind];
  const { mimeType, data } = parseImageDataUrl(dataUrl, maxBytes);
  await Model.findOneAndUpdate(
    { user_id: userId },
    { $set: { mime_type: mimeType, data, size: data.length, updated_at: new Date() } },
    { upsert: true },
  );
  return setImageUrl(userId, field, `/api/users/${userId}/${kind}?v=${Date.now()}`);
};

const removeImage = async (kind, userId) => {
  const { Model, field } = IMAGE_KINDS[kind];
  await Model.deleteOne({ user_id: userId });
  return setImageUrl(userId, field, null);
};

const getImageFile = async (kind, userId) => {
  const { Model, missing } = IMAGE_KINDS[kind];
  const image = await Model.findOne({ user_id: userId }, { mime_type: 1, data: 1 }).lean();
  if (!image) throw new AppError(missing, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);
  return { mimeType: image.mime_type, data: Buffer.from(image.data.buffer ?? image.data) };
};

// PUT / DELETE /api/users/me/avatar, GET /api/users/:id/avatar — xoá => quay về avatar chữ cái đầu
export const saveUploadedAvatar = (userId, dataUrl) => saveImage('avatar', userId, dataUrl);
export const removeAvatar = (userId) => removeImage('avatar', userId);
export const getAvatarFile = (userId) => getImageFile('avatar', userId);

// PUT / DELETE /api/users/me/cover, GET /api/users/:id/cover — xoá => quay về dải màu mặc định
export const saveUploadedCover = (userId, dataUrl) => saveImage('cover', userId, dataUrl);
export const removeCover = (userId) => removeImage('cover', userId);
export const getCoverFile = (userId) => getImageFile('cover', userId);
