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

    // ── Bổ sung cho AI Planner (Groq) ──
    title: { type: String, default: '', trim: true }, // câu đầu tiên của người dùng (rút gọn) — hiện ở danh sách phiên
    // Tiêu chí chuyến đi hiện tại (tripCriteriaSchema) — "bộ nhớ" để lượt sau hiểu "rẻ hơn", "gần hơn"...
    criteria: { type: mongoose.Schema.Types.Mixed, default: null },
    // Điểm bắt buộc hiện tại (người dùng gọi tên / món đã chọn) — lượt "sửa lộ trình" giữ lại các điểm này
    must_visit_ids: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // Yêu cầu đang chờ người dùng trả lời (hỏi lại / từ chối vì phi thực tế) — services/ai/pendingRequest.js
    pending: { type: mongoose.Schema.Types.Mixed, default: null },
    last_intent: { type: String, default: null },
    model_tier: { type: String, default: null },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

// Danh sách phiên của 1 người, mới nhất trước
aiSessionSchema.index({ user_id: 1, updated_at: -1 });

const AiSession = mongoose.model('AiSession', aiSessionSchema);
export default AiSession;
