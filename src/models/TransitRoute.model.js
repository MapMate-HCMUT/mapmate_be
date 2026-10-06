import mongoose from 'mongoose';
import { TRANSIT_MODE_VALUES } from '../constants/transit.js';

// Tuyến xe buýt / metro / buýt đường sông (nguồn: Trung tâm QLGT công cộng TP.HCM). Mỗi tuyến có các "lượt" (chiều đi, về...):
// thứ tự trạm, vị trí trạm trên lộ trình (mét tính từ đầu tuyến), đường đi, giờ xuất bến theo thứ trong tuần.
const timetableSchema = new mongoose.Schema(
  {
    apply_days: { type: [String], default: [] }, // ['T2', 'T3', ..., 'CN']
    departures: { type: [String], default: [] }, // giờ xuất bến ở trạm đầu: ['05:00', '05:10', ...]
    headway_text: String,
    operation_time: String,
  },
  { _id: false },
);

const variantSchema = new mongoose.Schema(
  {
    var_id: { type: Number, required: true },
    name: String, // "Lượt đi: Bến Thành - Thạnh Lộc"
    short_name: String, // hướng đi, VD "Thạnh Xuân"
    outbound: Boolean,
    start_stop: String,
    end_stop: String,
    distance_m: Number,
    running_min: Number, // thời gian chạy hết lượt
    stop_ids: { type: [Number], default: [] },
    stop_offsets_m: { type: [Number], default: [] }, // vị trí mỗi trạm dọc lộ trình (m)
    stop_path_index: { type: [Number], default: [] }, // điểm gần trạm nhất trên `path` (cắt đoạn đường để vẽ)
    path: { type: [[Number]], default: [] }, // [lng, lat][]
    timetables: { type: [timetableSchema], default: [] },
  },
  { _id: false },
);

const transitRouteSchema = new mongoose.Schema(
  {
    route_id: { type: Number, required: true, unique: true },
    number: { type: String, required: true }, // "03", "MRT1"
    name: { type: String, required: true },
    mode: { type: String, enum: TRANSIT_MODE_VALUES, required: true },
    is_public: { type: Boolean, default: true }, // tuyến đưa rước học sinh => false (không gợi ý)
    color: String,
    type: String, // "Phổ thông - Có trợ giá"
    operator: String,
    distance_m: Number,
    trip_minutes: String, // "60 - 65"
    headway_text: String, // "6 - 14" (phút)
    operation_time: String, // "04:00 - 21:00"
    tickets: { type: [String], default: [] },
    variants: { type: [variantSchema], default: [] },
    active: { type: Boolean, default: true },
    imported_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false },
);

transitRouteSchema.index({ active: 1, mode: 1 });

const TransitRoute = mongoose.model('TransitRoute', transitRouteSchema);
export default TransitRoute;
