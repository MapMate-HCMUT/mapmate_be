import mongoose from 'mongoose';
import { BUSINESS_STAT_RETENTION_DAYS } from '../constants/business.js';

const DAY_SECONDS = 24 * 60 * 60;

// Thống kê cửa hàng theo ngày (giờ VN): lượt xem chi tiết, lượt hiện trong kết quả tìm kiếm, lượt bấm chỉ đường.
const businessStatSchema = new mongoose.Schema(
  {
    place_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true },
    day: { type: String, required: true }, // "YYYY-MM-DD"
    views: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    directions: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'business_stats' },
);

businessStatSchema.index({ place_id: 1, day: 1 }, { unique: true });
businessStatSchema.index({ business_id: 1, day: 1 });
// Gói cao nhất xem 90 ngày => giữ 120 ngày rồi MongoDB tự xoá
businessStatSchema.index({ created_at: 1 }, { expireAfterSeconds: BUSINESS_STAT_RETENTION_DAYS * DAY_SECONDS });

export const BusinessStat = mongoose.model('BusinessStat', businessStatSchema);
