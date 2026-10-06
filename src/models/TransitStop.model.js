import mongoose from 'mongoose';
import { TRANSIT_MODE_VALUES } from '../constants/transit.js';

// Trạm xe buýt / ga metro / bến buýt đường sông (nguồn: Trung tâm QLGT công cộng TP.HCM)
const transitStopSchema = new mongoose.Schema(
  {
    stop_id: { type: Number, required: true, unique: true }, // dùng cho dự đoán xe tới trạm
    code: String, // "BX 01"
    name: { type: String, required: true },
    stop_type: String, // Bến xe / Nhà chờ / Trụ dừng / Ô sơn
    address: String,
    street: String,
    ward: String,
    zone: String, // quận
    wheelchair: { type: Boolean, default: null },
    location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
    route_numbers: { type: [String], default: [] }, // các tuyến dừng ở trạm
    modes: { type: [String], enum: TRANSIT_MODE_VALUES, default: [] },
    active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false },
);

transitStopSchema.index({ location: '2dsphere' });

const TransitStop = mongoose.model('TransitStop', transitStopSchema);
export default TransitStop;
