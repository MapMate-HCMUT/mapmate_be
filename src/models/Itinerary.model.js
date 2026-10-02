import mongoose from 'mongoose';
import { ITINERARY_VISIBILITY } from '../constants/social.js';
import { VEHICLE_VALUES } from '../constants/transport.js';

// Sub-document: Mỗi trạm dừng trong lộ trình
const stopSchema = new mongoose.Schema(
  {
    place_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Place',
    },
    place_name: {
      type: String,
      required: true,
      trim: true,
    },
    arrival_time: {
      type: String, // Ví dụ: "08:30", "14:00"
      default: '',
    },
    checked_in: {
      type: Boolean,
      default: false,
    },
    // ── Bổ sung: ảnh chụp thông tin trạm tại thời điểm lên lộ trình (đọc 1 lần là đủ, không cần JOIN) ──
    category: { type: String, default: 'other' },
    address: { type: String, default: '' },
    coordinates: { type: [Number], default: undefined }, // [lng, lat]
    stay_minutes: { type: Number, default: 0, min: 0 },
    travel_minutes: { type: Number, default: 0, min: 0 }, // từ trạm trước (hoặc điểm xuất phát)
    distance_km: { type: Number, default: 0, min: 0 },
    est_cost: { type: Number, default: 0, min: 0 }, // VNĐ / người
    // Cách di chuyển tới trạm này: { mode, label, emoji, cost_per_person, segments[] }
    travel: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { _id: true }
);

const itinerarySchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID là bắt buộc'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Tên lộ trình là bắt buộc'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'completed', 'cancelled'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'active',
    },
    vehicle: {
      type: String,
      enum: {
        values: VEHICLE_VALUES, // bike, car, walk, bus + public (buýt + metro + đi bộ), metro_grab, custom
        message: 'Phương tiện {VALUE} không hợp lệ',
      },
      default: 'bike',
    },
    total_cost: {
      type: Number, // Đơn vị: VNĐ
      default: 0,
      min: 0,
    },
    total_duration: {
      type: Number, // Đơn vị: phút
      default: 0,
      min: 0,
    },
    stops: {
      type: [stopSchema],
      default: [],
    },
    route_polyline: {
      type: String, // Encoded polyline string từ Goong Directions API
      default: '',
    },

    // ── Bổ sung cho Khám phá & chia sẻ ──
    people: { type: Number, default: 1, min: 1 },
    total_distance_km: { type: Number, default: 0, min: 0 },
    start_time: { type: String, default: '' }, // "HH:mm"
    // Bộ lọc người dùng đã chọn khi lên lộ trình — dữ liệu đầu vào cho AI Planner / gợi ý lại
    criteria: { type: mongoose.Schema.Types.Mixed, default: null },
    visibility: {
      type: String,
      enum: Object.values(ITINERARY_VISIBILITY),
      default: ITINERARY_VISIBILITY.PRIVATE,
    },
    tags: { type: [String], default: [] },
    cloned_from: { type: mongoose.Schema.Types.ObjectId, ref: 'Itinerary', default: null },
    transport_modes: { type: [String], default: [] }, // các phương tiện tự chọn khi vehicle = 'custom'
    // Bảng tổng hợp: thời gian, quãng đường, chi phí địa điểm + di chuyển, theo từng phương tiện (xem buildPlan)
    summary: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// Danh sách lộ trình của tôi, mới nhất trước
itinerarySchema.index({ user_id: 1, created_at: -1 });

const Itinerary = mongoose.model('Itinerary', itinerarySchema);
export default Itinerary;
