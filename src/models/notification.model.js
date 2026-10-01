import mongoose from 'mongoose';
import { NOTIFICATION_TTL_DAYS, NOTIFICATION_TYPES } from '../constants/notifications.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

const notificationSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(NOTIFICATION_TYPES), required: true },
    title: { type: String, required: true, maxlength: 120 },
    body: { type: String, default: '', maxlength: 500 },
    icon: { type: String, default: '🔔' },
    link: { type: String, default: null }, // đường dẫn trong app khi bấm vào thông báo
    read_at: { type: Date, default: null },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'notifications' },
);

// Danh sách thông báo mới nhất của 1 người (phân trang cursor).
notificationSchema.index({ user_id: 1, created_at: -1 });
// Đếm nhanh số chưa đọc: chỉ index những thông báo chưa đọc.
notificationSchema.index({ user_id: 1 }, { name: 'unread_by_user', partialFilterExpression: { read_at: null } });
// Tự dọn thông báo cũ.
notificationSchema.index({ created_at: 1 }, { expireAfterSeconds: NOTIFICATION_TTL_DAYS * SECONDS_PER_DAY });

export const Notification = mongoose.model('Notification', notificationSchema);
