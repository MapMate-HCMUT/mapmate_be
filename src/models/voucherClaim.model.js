import mongoose from 'mongoose';
import { VOUCHER_STATUS } from '../constants/business.js';

// Mã voucher khách đã săn được (hoặc lượt quay trượt). Quán nhập mã để xác nhận khách đã dùng.
const voucherClaimSchema = new mongoose.Schema(
  {
    promotion_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Promotion', required: true },
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Mỗi người 1 lượt / sự kiện ("<userId>"), riêng vòng quay 1 lượt / ngày ("<userId>:<YYYY-MM-DD>")
    play_key: { type: String, required: true },
    code: { type: String, default: null },
    prize_label: { type: String, default: null },
    status: { type: String, enum: Object.values(VOUCHER_STATUS), default: VOUCHER_STATUS.CLAIMED },
    // Chép sẵn để hiện trong ví mà không cần tra thêm
    business_name: String,
    place_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Place' },
    place_name: String,
    title: String,
    expires_at: { type: Date, required: true },
    used_at: { type: Date, default: null },
  },
  { versionKey: false, collection: 'voucher_claims', timestamps: { createdAt: 'claimed_at', updatedAt: 'updated_at' } },
);

voucherClaimSchema.index({ promotion_id: 1, play_key: 1 }, { unique: true });
voucherClaimSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } });
voucherClaimSchema.index({ user_id: 1, claimed_at: -1 });

export const VoucherClaim = mongoose.model('VoucherClaim', voucherClaimSchema);
