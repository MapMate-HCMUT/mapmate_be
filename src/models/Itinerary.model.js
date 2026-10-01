import mongoose from 'mongoose';

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
        values: ['bike', 'car', 'bus', 'walk'],
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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

const Itinerary = mongoose.model('Itinerary', itinerarySchema);
export default Itinerary;
