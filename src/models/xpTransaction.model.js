import mongoose from 'mongoose';
import { XP_ACTIONS } from '../constants/gamification.js';

// Sổ cái XP (ledger): mỗi lần cộng điểm ghi 1 dòng bất biến.
// - Tính bảng xếp hạng theo tuần/tháng bằng aggregation (users.xp chỉ có tổng mọi thời đại).
// - Truy vết lịch sử điểm, chống cộng trùng nhờ ref_key.
const xpTransactionSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: Object.values(XP_ACTIONS), required: true },
    xp: { type: Number, required: true, min: 0 },
    stars: { type: Number, default: 0, min: 0 },
    // Khóa nghiệp vụ chống trùng, VD "stop:<itineraryId>:<placeId>", "streak:2026-10-01", "badge:pioneer"
    ref_key: { type: String },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'xp_transactions' },
);

// Lịch sử điểm của 1 người, mới nhất trước.
xpTransactionSchema.index({ user_id: 1, created_at: -1 });
// Covering index cho leaderboard tuần/tháng: lọc created_at, group theo user_id, cộng xp — không cần đọc document.
xpTransactionSchema.index({ created_at: 1, user_id: 1, xp: 1 });
// Idempotency: cùng 1 hành động + cùng ref_key chỉ được thưởng 1 lần.
xpTransactionSchema.index(
  { user_id: 1, action: 1, ref_key: 1 },
  { unique: true, partialFilterExpression: { ref_key: { $exists: true } } },
);

export const XpTransaction = mongoose.model('XpTransaction', xpTransactionSchema);
