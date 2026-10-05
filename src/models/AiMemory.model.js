import mongoose from 'mongoose';

// Ghi nhớ của AI Planner về 1 người dùng: sở thích tự học từ các lượt trò chuyện + ghi chú người dùng bảo "nhớ giúp".
// Chỉ lưu nhãn / giá trị ngắn (không lưu nguyên câu chat). Người dùng xem / xoá / tắt ở trang AI Planner.
const noteSchema = new mongoose.Schema(
  { text: { type: String, required: true, trim: true }, created_at: { type: Date, default: Date.now } },
  { _id: true },
);

const aiMemorySchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: true },
    facts: {
      vehicle: { type: String, default: null },
      people: { type: Number, default: null },
      budget_per_person: { type: Number, default: null },
      diet: { type: String, default: null }, // 'chay'
      favorite_areas: { type: [String], default: [] },
      favorite_foods: { type: [String], default: [] },
      likes: { type: [String], default: [] }, // phong cách hay chọn: 'hen-ho', 'yen-tinh'...
    },
    notes: { type: [noteSchema], default: [] },
    // Đếm số lần xuất hiện để học: { vehicle: { bike: 3 }, areas: { 'Quận 3': 2 }, budgets: [300000, ...] }
    stats: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }, versionKey: false, minimize: false },
);

const AiMemory = mongoose.model('AiMemory', aiMemorySchema);
export default AiMemory;
