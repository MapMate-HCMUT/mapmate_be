import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notification.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const getNotifications = asyncHandler(async (req, res) => {
  const data = await listNotifications(req.user.id, req.validated.query);
  return sendSuccess(res, { message: 'Lấy thông báo thành công', data });
});

export const getUnread = asyncHandler(async (req, res) => {
  const unreadCount = await getUnreadCount(req.user.id);
  return sendSuccess(res, { data: { unread_count: unreadCount } });
});

export const readOne = asyncHandler(async (req, res) => {
  const data = await markNotificationRead(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã đánh dấu đã đọc', data });
});

export const readAll = asyncHandler(async (req, res) => {
  const data = await markAllNotificationsRead(req.user.id);
  return sendSuccess(res, { message: 'Đã đánh dấu tất cả là đã đọc', data });
});
