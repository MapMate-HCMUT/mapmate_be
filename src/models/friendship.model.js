import mongoose from 'mongoose';
import { FRIENDSHIP_STATUS } from '../constants/social.js';

// 1 document cho mỗi cặp người dùng (lời mời đang chờ hoặc đã là bạn).
const friendshipSchema = new mongoose.Schema(
  {
    requester_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: Object.values(FRIENDSHIP_STATUS), default: FRIENDSHIP_STATUS.PENDING },
    // "idNhỏ:idLớn" — giống nhau dù ai gửi cho ai => unique index chặn trùng cả 2 chiều.
    pair_key: { type: String, required: true },
    created_at: { type: Date, default: Date.now },
    accepted_at: { type: Date, default: null },
  },
  { versionKey: false, collection: 'friendships' },
);

friendshipSchema.index({ pair_key: 1 }, { unique: true });
// Danh sách bạn / lời mời của 1 người, theo cả 2 vai trò
friendshipSchema.index({ requester_id: 1, status: 1 });
friendshipSchema.index({ recipient_id: 1, status: 1 });

export const buildPairKey = (userA, userB) => [String(userA), String(userB)].sort().join(':');

export const Friendship = mongoose.model('Friendship', friendshipSchema);
export default Friendship;
