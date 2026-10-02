import mongoose from 'mongoose';
import { POST_CONTENT_MAX_LENGTH, POST_TYPES, POST_VISIBILITY } from '../constants/social.js';

const { ObjectId } = mongoose.Schema.Types;

// Bài viết trên Bảng tin: giới thiệu địa điểm, chia sẻ lộ trình, hoặc đăng lại bài của người khác.
const postSchema = new mongoose.Schema(
  {
    author_id: { type: ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(POST_TYPES), required: true },
    content: { type: String, default: '', trim: true, maxlength: POST_CONTENT_MAX_LENGTH },
    place_id: { type: ObjectId, ref: 'Place', default: null },
    itinerary_id: { type: ObjectId, ref: 'Itinerary', default: null },
    rating: { type: Number, min: 1, max: 5, default: null }, // đánh giá của người đăng cho địa điểm
    visited: { type: Boolean, default: false }, // "Mình đã đến đây"
    tags: { type: [String], default: [] }, // hashtag, đã chuẩn hoá: viết thường, không có "#"
    tagged_user_ids: { type: [{ type: ObjectId, ref: 'User' }], default: [] },
    visibility: { type: String, enum: Object.values(POST_VISIBILITY), default: POST_VISIBILITY.PUBLIC },
    repost_of: { type: ObjectId, ref: 'Post', default: null },
    is_repost: { type: Boolean, default: false }, // vẫn biết là bài đăng lại kể cả khi bài gốc đã bị xoá
    like_count: { type: Number, default: 0, min: 0 },
    repost_count: { type: Number, default: 0, min: 0 },
  },
  { versionKey: false, collection: 'posts', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// Tường của 1 người / bảng tin bạn bè (author_id IN [...]) — mới nhất trước
postSchema.index({ author_id: 1, created_at: -1 });
// Bảng tin cộng đồng
postSchema.index({ visibility: 1, created_at: -1 });
// Lọc theo hashtag + thống kê hashtag nổi bật
postSchema.index({ tags: 1, created_at: -1 });
// Các bài viết về 1 địa điểm
postSchema.index({ place_id: 1, created_at: -1 }, { partialFilterExpression: { place_id: { $type: 'objectId' } } });
// Mỗi người chỉ đăng lại 1 bài 1 lần
postSchema.index(
  { author_id: 1, repost_of: 1 },
  { unique: true, partialFilterExpression: { repost_of: { $type: 'objectId' } } },
);

export const Post = mongoose.model('Post', postSchema);
export default Post;
