import mongoose from 'mongoose';
import { PLACE_REPORT_TTL_DAYS, PLACE_REPORT_TYPES } from '../constants/places.js';

const SECONDS_PER_DAY = 24 * 60 * 60;

// Người dùng báo địa điểm "đã đóng cửa" hoặc "vẫn mở". Mỗi người 1 phiếu / địa điểm (báo lại = đổi phiếu).
const placeReportSchema = new mongoose.Schema(
  {
    place_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: Object.values(PLACE_REPORT_TYPES), required: true },
  },
  { versionKey: false, collection: 'place_reports', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

placeReportSchema.index({ place_id: 1, user_id: 1 }, { unique: true });
// Phiếu cũ tự hết hạn: quán mở lại / đổi chủ sau nửa năm thì phiếu cũ không còn đúng.
placeReportSchema.index({ updated_at: 1 }, { expireAfterSeconds: PLACE_REPORT_TTL_DAYS * SECONDS_PER_DAY });

export const PlaceReport = mongoose.model('PlaceReport', placeReportSchema);
export default PlaceReport;
