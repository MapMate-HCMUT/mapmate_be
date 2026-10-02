import mongoose from 'mongoose';

const userAchievementSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID là bắt buộc'],
      index: true,
    },
    badge_name: {
      type: String,
      required: [true, 'Tên huy hiệu là bắt buộc'],
      trim: true,
    },
    badge_icon: {
      type: String, // Emoji hoặc URL icon
      default: '🏅',
    },
    xp_reward: {
      type: Number,
      default: 0,
      min: 0,
    },
    unlocked_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Index compound: Mỗi user chỉ nhận 1 huy hiệu cùng tên
userAchievementSchema.index({ user_id: 1, badge_name: 1 }, { unique: true });

const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);
export default UserAchievement;
