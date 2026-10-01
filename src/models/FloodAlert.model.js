import mongoose from 'mongoose';

const floodAlertSchema = new mongoose.Schema(
  {
    street_name: {
      type: String,
      required: [true, 'Tên đường là bắt buộc'],
      trim: true,
    },
    // GeoJSON Point — Tọa độ điểm ngập
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Tọa độ điểm ngập là bắt buộc'],
      },
    },
    water_level_cm: {
      type: Number, // Đơn vị: cm
      default: 0,
      min: 0,
    },
    severity: {
      type: String,
      enum: {
        values: ['alert', 'danger'],
        message: 'Mức cảnh báo {VALUE} không hợp lệ',
      },
      default: 'alert',
    },
    report_count: {
      type: Number, // Số lượng báo cáo cộng đồng xác nhận
      default: 0,
      min: 0,
    },
    source: {
      type: String,
      enum: {
        values: ['crowd', 'sensor'],
        message: 'Nguồn {VALUE} không hợp lệ',
      },
      default: 'crowd',
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'clear'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'active',
    },
    last_updated: {
      type: Date,
      default: Date.now,
    },
    expires_at: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: false, // Dùng last_updated thay vì timestamps tự động
    versionKey: false,
  }
);

// Index 2dsphere cho truy vấn $geoIntersects — thuật toán né ngập
floodAlertSchema.index({ location: '2dsphere' });
// TTL Index: Tự động xóa cảnh báo hết hạn
floodAlertSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
// Index tìm nhanh cảnh báo đang active
floodAlertSchema.index({ status: 1, severity: 1 });

const FloodAlert = mongoose.model('FloodAlert', floodAlertSchema);
export default FloodAlert;
