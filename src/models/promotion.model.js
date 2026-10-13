import mongoose from 'mongoose';
import { PROMOTION_KIND_VALUES, PROMOTION_KINDS, PROMOTION_LIMITS } from '../constants/business.js';

// Khuyến mãi của doanh nghiệp, áp dụng cho 1 hoặc nhiều cửa hàng. Đang chạy = starts_at ≤ bây giờ < ends_at.
const promotionSchema = new mongoose.Schema(
  {
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    place_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Place' }], required: true },
    kind: { type: String, enum: PROMOTION_KIND_VALUES, default: PROMOTION_KINDS.DEAL },
    // Voucher giới hạn / check-in: tổng số mã phát ra; claimed_count tăng nguyên tử khi khách nhận (không phát quá số lượng)
    quantity: { type: Number, default: null, min: 1 },
    claimed_count: { type: Number, default: 0, min: 0 },
    used_count: { type: Number, default: 0, min: 0 }, // quán đã xác nhận khách dùng
    // Vòng quay may mắn: các giải (số lượng + tỉ trọng) + tỉ trọng "chúc may mắn lần sau"
    prizes: {
      type: [{ label: { type: String, trim: true }, quantity: Number, claimed: { type: Number, default: 0 }, weight: Number }],
      default: undefined,
    },
    lose_weight: { type: Number, default: 0, min: 0 },
    title: { type: String, required: true, trim: true, maxlength: PROMOTION_LIMITS.TITLE_MAX },
    label: { type: String, required: true, trim: true, maxlength: PROMOTION_LIMITS.LABEL_MAX },
    description: { type: String, default: null, trim: true, maxlength: PROMOTION_LIMITS.DESCRIPTION_MAX },
    code: { type: String, default: null, trim: true, maxlength: PROMOTION_LIMITS.CODE_MAX },
    starts_at: { type: Date, required: true },
    ends_at: { type: Date, required: true },
    notified_at: { type: Date, default: null }, // đã báo cho khách đã lưu quán
    notified_count: { type: Number, default: 0 },
  },
  { versionKey: false, collection: 'promotions', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

promotionSchema.index({ business_id: 1, ends_at: -1 });
promotionSchema.index({ place_ids: 1, ends_at: 1 });

export const Promotion = mongoose.model('Promotion', promotionSchema);
