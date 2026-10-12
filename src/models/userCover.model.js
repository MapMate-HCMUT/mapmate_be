import mongoose from 'mongoose';

// Ảnh bìa hồ sơ người dùng tự tải lên (đã cắt 4:1, nén ≤700KB ở trình duyệt).
// Tách riêng khỏi users giống ảnh đại diện để truy vấn user không kéo theo dữ liệu ảnh.
const userCoverSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    mime_type: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'user_covers' },
);

export const UserCover = mongoose.model('UserCover', userCoverSchema);
