import mongoose from 'mongoose';

// Collection USER_ACHIEVEMENTS (Milestone 2 — mục 4.3)
const userAchievementSchema = new mongoose.Schema(
  {
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    badge_code: { type: String, required: true },
    badge_name: { type: String, required: true },
    badge_icon: { type: String, required: true },
    xp_reward: { type: Number, default: 0, min: 0 },
    unlocked_at: { type: Date, default: Date.now },
  },
  { versionKey: false, collection: 'user_achievements' },
);

// Mỗi người chỉ nhận 1 huy hiệu 1 lần — chặn ở tầng DB, an toàn kể cả khi 2 request chạy song song.
userAchievementSchema.index({ user_id: 1, badge_code: 1 }, { unique: true });

export const UserAchievement = mongoose.model('UserAchievement', userAchievementSchema);
export default UserAchievement;
