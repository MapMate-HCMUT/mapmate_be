import mongoose from 'mongoose';
import { COMMENT_MAX_LENGTH } from '../constants/social.js';

const { ObjectId } = mongoose.Schema.Types;

// Bình luận dưới 1 bài viết (chỉ chữ — lưu trong MongoDB). Quyền xem / bình luận đi theo quyền xem bài viết.
const postCommentSchema = new mongoose.Schema(
  {
    post_id: { type: ObjectId, ref: 'Post', required: true },
    author_id: { type: ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: COMMENT_MAX_LENGTH },
  },
  { versionKey: false, collection: 'post_comments', timestamps: { createdAt: 'created_at', updatedAt: false } },
);

// Bình luận của 1 bài, cũ trước (đọc như cuộc trò chuyện) — phân trang theo created_at
postCommentSchema.index({ post_id: 1, created_at: 1 });

export const PostComment = mongoose.model('PostComment', postCommentSchema);
export default PostComment;
