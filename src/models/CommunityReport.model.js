import mongoose from 'mongoose';

const communityReportSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID là bắt buộc'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['flood', 'pothole', 'accident', 'construction', 'other'],
        message: 'Loại báo cáo {VALUE} không hợp lệ',
      },
      required: [true, 'Loại báo cáo là bắt buộc'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [500, 'Mô tả tối đa 500 ký tự'],
    },
    // GeoJSON Point — Vị trí báo cáo
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Tọa độ báo cáo là bắt buộc'],
      },
    },
    street_name: {
      type: String,
      default: '',
      trim: true,
    },
    severity: {
      type: String,
      enum: {
        values: ['low', 'medium', 'high'],
        message: 'Mức độ {VALUE} không hợp lệ',
      },
      default: 'medium',
    },
    photo_url: {
      type: String,
      default: '',
    },
    upvotes: {
      type: Number,
      default: 0,
      min: 0,
    },
    verifications: {
      type: Number,
      default: 0,
      min: 0,
    },
    trust_score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'expired', 'resolved'],
        message: 'Trạng thái {VALUE} không hợp lệ',
      },
      default: 'active',
    },
    expires_at: {
      type: Date,
      required: true,
      // TTL Index được khai báo bên dưới qua schema.index()
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// Index 2dsphere cho truy vấn vùng báo cáo lân cận
communityReportSchema.index({ location: '2dsphere' });
// TTL Index: Tự động xóa báo cáo hết hạn (MongoDB tự xử lý)
communityReportSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
// Index lọc theo loại + trạng thái
communityReportSchema.index({ type: 1, status: 1 });

const CommunityReport = mongoose.model('CommunityReport', communityReportSchema);
export default CommunityReport;
