import mongoose from 'mongoose';
import { TRASH_KINDS } from '../constants/social.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Thùng rác của 1 người: bài viết đã xoá (bản chụp nguyên vẹn để khôi phục đúng như cũ — giữ id, lượt thích, bình luận)
// hoặc 1 ảnh / video bị bỏ khi chỉnh bài. Bài trong thùng rác không còn ở collection posts => bảng tin không phải lọc gì thêm.
const trashItemSchema = new mongoose.Schema(
  {
    user_id: { type: ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: Object.values(TRASH_KINDS), required: true },
    post_id: { type: ObjectId, required: true }, // bài đã xoá / bài chứa ảnh này
    post: { type: Mixed, default: null }, // kind = post: toàn bộ document bài viết lúc xoá
    media: { type: Mixed, default: null }, // kind = media: 1 phần tử của Post.media
    expires_at: { type: Date, required: true }, // quá hạn => xoá vĩnh viễn (dọn theo giờ)
  },
  { versionKey: false, collection: 'trash_items', timestamps: { createdAt: 'deleted_at', updatedAt: false } },
);

trashItemSchema.index({ user_id: 1, deleted_at: -1 });
trashItemSchema.index({ expires_at: 1 });
trashItemSchema.index({ post_id: 1, kind: 1 });

export const TrashItem = mongoose.model('TrashItem', trashItemSchema);
export default TrashItem;
