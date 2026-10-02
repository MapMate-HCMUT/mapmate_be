import mongoose from 'mongoose';
import { PIN_NOTE_MAX_LENGTH, PIN_STATUS } from '../constants/social.js';

// Địa điểm người dùng ghim: "Đã đi" (visited) hoặc "Muốn đi" (wishlist).
const placePinSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    place_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Place', required: true },
    status: { type: String, enum: Object.values(PIN_STATUS), default: PIN_STATUS.VISITED },
    note: { type: String, default: '', trim: true, maxlength: PIN_NOTE_MAX_LENGTH },
    rating: { type: Number, min: 1, max: 5, default: null },
    visited_on: { type: Date, default: null },
  },
  { versionKey: false, collection: 'place_pins', timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } },
);

// Mỗi người ghim 1 địa điểm 1 lần (đổi trạng thái = cập nhật)
placePinSchema.index({ user_id: 1, place_id: 1 }, { unique: true });
// Danh sách ghim của 1 người theo trạng thái, mới nhất trước
placePinSchema.index({ user_id: 1, status: 1, updated_at: -1 });

export const PlacePin = mongoose.model('PlacePin', placePinSchema);
export default PlacePin;
