import mongoose from 'mongoose';

// Ảnh đại diện người dùng tự tải lên (đã thu nhỏ ≤256KB ở trình duyệt).
// Tách riêng khỏi users để mọi truy vấn user không phải kéo theo dữ liệu ảnh.
const userAvatarSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    mime_type: { type: String, required: true },
    data: { type: Buffer, required: true },
    size: { type: Number, required: true },
    updated_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'user_avatars' },
);

export const UserAvatar = mongoose.model('UserAvatar', userAvatarSchema);
