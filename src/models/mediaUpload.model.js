import mongoose from 'mongoose';
import { MEDIA_TYPES, MEDIA_UPLOAD_STATUS } from '../constants/social.js';

// Sổ ghi từng file tải lên Cloudinary: cấp chữ ký => "pending"; gắn vào bài viết => "attached"; xoá => "deleted".
// Dùng để tính hạn mức mỗi người / ngày, chặn dùng lại 1 file cho nhiều bài và dọn file bỏ dở (không đăng bài).
const mediaUploadSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    public_id: { type: String, required: true, unique: true },
    resource_type: { type: String, enum: MEDIA_TYPES, required: true },
    status: { type: String, enum: Object.values(MEDIA_UPLOAD_STATUS), default: MEDIA_UPLOAD_STATUS.PENDING },
    bytes: { type: Number, default: null }, // biết sau khi kiểm tra với Cloudinary lúc đăng bài
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', default: null },
  },
  { versionKey: false, collection: 'media_uploads', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

mediaUploadSchema.index({ user_id: 1, created_at: -1 });
mediaUploadSchema.index({ status: 1, created_at: 1 });

export const MediaUpload = mongoose.model('MediaUpload', mediaUploadSchema);
