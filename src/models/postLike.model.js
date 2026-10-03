import mongoose from 'mongoose';

const postLikeSchema = new mongoose.Schema(
  {
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'post_likes' },
);

// Mỗi người thích 1 bài 1 lần; đồng thời phục vụ truy vấn "tôi đã thích những bài nào trong trang này"
postLikeSchema.index({ post_id: 1, user_id: 1 }, { unique: true });
postLikeSchema.index({ user_id: 1, post_id: 1 });

export const PostLike = mongoose.model('PostLike', postLikeSchema);
export default PostLike;
