import mongoose from 'mongoose';

const placeSchema = new mongoose.Schema(
  {
    goong_place_id: {
      type: String,
      unique: true,
      sparse: true, // Cho phép null nhưng nếu có thì phải unique
      trim: true,
    },
    name: {
      type: String,
      required: [true, 'Tên địa điểm là bắt buộc'],
      trim: true,
    },
    address: {
      type: String,
      default: '',
      trim: true,
    },
    category: {
      type: String,
      enum: {
        values: ['food', 'cafe', 'hotel', 'attraction', 'shopping', 'transport', 'other'],
        message: 'Danh mục {VALUE} không hợp lệ',
      },
      default: 'other',
    },
    // GeoJSON Point — Bắt buộc có index 2dsphere để truy vấn không gian
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: [true, 'Tọa độ là bắt buộc'],
      },
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    price_range: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    district: {
      type: String,
      default: '',
      trim: true,
    },
    specialties: {
      type: [String],
      default: [],
    },
    cached_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// Index 2dsphere cho truy vấn không gian ($geoNear, $geoIntersects)
placeSchema.index({ location: '2dsphere' });
// Index tìm kiếm theo danh mục + quận
placeSchema.index({ category: 1, district: 1 });

const Place = mongoose.model('Place', placeSchema);
export default Place;
