import mongoose from 'mongoose';
import { BUSINESS_DEFAULT_TIER, BUSINESS_LIMITS, BUSINESS_TIER_VALUES } from '../constants/business.js';

// Hồ sơ doanh nghiệp: 1 tài khoản người dùng = tối đa 1 doanh nghiệp, sở hữu nhiều cửa hàng (Place.business_id) theo gói.
const businessSchema = new mongoose.Schema(
  {
    owner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: BUSINESS_LIMITS.NAME_MAX },
    description: { type: String, default: null, trim: true, maxlength: BUSINESS_LIMITS.DESCRIPTION_MAX },
    phone: { type: String, default: null, trim: true },
    website: { type: String, default: null, trim: true },
    tier: { type: String, enum: BUSINESS_TIER_VALUES, default: BUSINESS_DEFAULT_TIER },
    tier_changed_at: { type: Date, default: null },
  },
  { versionKey: false, collection: 'businesses', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

export const Business = mongoose.model('Business', businessSchema);
