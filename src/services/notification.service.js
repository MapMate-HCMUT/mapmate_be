import { PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { Notification } from '../models/notification.model.js';
import { AppError } from '../utils/AppError.js';


/**
 * Tạo thông báo cho 1 người. Truyền `session` khi gọi bên trong transaction để thông báo
 * chỉ được lưu nếu hành động gốc (VD mở huy hiệu) thành công.
 */
export const notifyUser = async (userId, { type, title, body = '', icon = '🔔', link = null }, session) => {
  await Notification.create([{ user_id: userId, type, title, body, icon, link }], session ? { session } : {});
};

export const getUnreadCount = (userId) => Notification.countDocuments({ user_id: userId, read_at: null });

// Phân trang cursor theo created_at, kèm số chưa đọc để cập nhật chấm đỏ trên chuông.
export const listNotifications = async (userId, { limit, before }) => {
  const filter = { user_id: userId, ...(before && { created_at: { $lt: before } }) };
  const [rows, unreadCount] = await Promise.all([
    Notification.find(filter, { user_id: 0 }).sort({ created_at: -1 }).limit(limit + 1).lean(),
    getUnreadCount(userId),
  ]);

  const items = rows.slice(0, limit).map(({ _id, ...row }) => ({ id: _id, ...row }));
  return { items, next_cursor: rows.length > limit ? items.at(-1).created_at : null, unread_count: unreadCount };
};

export const markNotificationRead = async (userId, notificationId) => {
  // Điều kiện user_id => không thể đánh dấu thông báo của người khác.
  const result = await Notification.updateOne(
    { _id: notificationId, user_id: userId },
    [{ $set: { read_at: { $ifNull: ['$read_at', '$$NOW'] } } }],
  );
  if (result.matchedCount === 0) {
    throw new AppError('Không tìm thấy thông báo', HTTP_STATUS.NOT_FOUND, PROFILE_ERROR_CODES.NOTIFICATION_NOT_FOUND);
  }
  return { unread_count: await getUnreadCount(userId) };
};

export const markAllNotificationsRead = async (userId) => {
  const { modifiedCount } = await Notification.updateMany({ user_id: userId, read_at: null }, { $set: { read_at: new Date() } });
  return { updated: modifiedCount, unread_count: 0 };
};
