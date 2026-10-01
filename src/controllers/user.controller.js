import { getAvatarFile, removeAvatar, saveUploadedAvatar } from '../services/avatar.service.js';
import { reverseGeocodeArea } from '../services/geo.service.js';
import {
  changeMyPassword,
  checkUsernameAvailability,
  getMyProfile,
  getMyXpHistory,
  getPublicProfile,
  toPublicProfile,
  updateMyProfile,
} from '../services/user.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getMe = asyncHandler(async (req, res) => {
  const data = await getMyProfile(req.user.id);
  return sendSuccess(res, { message: 'Lấy thông tin cá nhân thành công', data });
});

export const updateMe = asyncHandler(async (req, res) => {
  const data = await updateMyProfile(req.user.id, req.validated.body);
  return sendSuccess(res, { message: 'Cập nhật hồ sơ thành công', data });
});

export const changePassword = asyncHandler(async (req, res) => {
  await changeMyPassword(req.user.id, req.validated.body);
  return sendSuccess(res, { message: 'Đổi mật khẩu thành công' });
});

export const getMyHistory = asyncHandler(async (req, res) => {
  const data = await getMyXpHistory(req.user.id, req.validated.query);
  return sendSuccess(res, { message: 'Lấy lịch sử hoạt động thành công', data });
});

export const getUserById = asyncHandler(async (req, res) => {
  const data = await getPublicProfile(req.validated.params.id);
  return sendSuccess(res, { message: 'Lấy hồ sơ thành công', data });
});

export const checkUsername = asyncHandler(async (req, res) => {
  const data = await checkUsernameAvailability(req.validated.query.username, req.user?.id);
  return sendSuccess(res, { message: data.available ? 'Tên người dùng hợp lệ' : data.reason, data });
});

export const uploadAvatar = asyncHandler(async (req, res) => {
  const user = await saveUploadedAvatar(req.user.id, req.validated.body.image);
  return sendSuccess(res, { message: 'Đã cập nhật ảnh đại diện', data: { profile: toPublicProfile(user) } });
});

export const deleteAvatar = asyncHandler(async (req, res) => {
  const user = await removeAvatar(req.user.id);
  return sendSuccess(res, { message: 'Đã xoá ảnh đại diện', data: { profile: toPublicProfile(user) } });
});

// Ảnh có URL kèm ?v=<thời điểm> nên cache vĩnh viễn được; đổi ảnh => URL mới.
export const getAvatar = asyncHandler(async (req, res) => {
  const { mimeType, data } = await getAvatarFile(req.validated.params.id);
  res.set({
    'Content-Type': mimeType,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Cross-Origin-Resource-Policy': 'cross-origin', // cho phép frontend khác domain hiển thị ảnh
  });
  return res.send(data);
});

export const reverseGeocode = asyncHandler(async (req, res) => {
  const data = await reverseGeocodeArea(req.validated.query);
  return sendSuccess(res, { message: 'Đã xác định khu vực', data });
});
