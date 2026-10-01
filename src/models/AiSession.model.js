import mongoose from 'mongoose';

// Sub-document: Mỗi tin nhắn trong phiên chat AI
const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: {
        values: ['user', 'model'],
        message: 'Role {VALUE} không hợp lệ',
      },
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

const aiSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID là bắt buộc'],
      index: true,
    },
    itinerary_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Itinerary',
      default: null, // Liên kết với lộ trình sau khi AI tạo xong
    },
    context: {
      budget: { type: Number, default: 0 },    // Ngân sách (VNĐ)
      vehicle: { type: String, default: '' },   // Phương tiện di chuyển
    },
    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

const AiSession = mongoose.model('AiSession', aiSessionSchema);
export default AiSession;
