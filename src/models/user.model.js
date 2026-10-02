import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { BCRYPT_ROUNDS, USERNAME_DB_MAX_LENGTH, USERNAME_MIN_LENGTH } from '../constants/auth.js';

const statsSchema = new mongoose.Schema(
  {
    total_actions: { type: Number, default: 0, min: 0 },
    checkins: { type: Number, default: 0, min: 0 },
    flood_reports: { type: Number, default: 0, min: 0 },
    road_reports: { type: Number, default: 0, min: 0 },
    trips_completed: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// Khu vực sinh sống gần đúng — CHỈ tên đường/quận/thành phố/quốc gia, không số nhà, không toạ độ.
const homeAreaSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, default: null },
    district: { type: String, trim: true, default: null },
    city: { type: String, trim: true, default: null },
    country: { type: String, trim: true, default: null },
  },
  { _id: false },
);

// Collection USERS (Milestone 2 — mục 4.3)
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, required: true, trim: true, minlength: USERNAME_MIN_LENGTH, maxlength: USERNAME_DB_MAX_LENGTH },
    password: { type: String, required: true, select: false }, // không bao giờ trả về trừ khi .select('+password')
    avatar_url: { type: String, default: null },
    level: { type: Number, default: 1, min: 1 },
    xp: { type: Number, default: 0, min: 0 },
    stars: { type: Number, default: 0, min: 0 },
    streak_days: { type: Number, default: 0, min: 0 },
    last_active_at: { type: Date, default: null },
    username_changed_at: { type: Date, default: null },
    birth_date: { type: Date, default: null },
    home_area: { type: homeAreaSchema, default: null },
    stats: { type: statsSchema, default: () => ({}) }, // bộ đếm phục vụ huy hiệu, cập nhật bằng $inc
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        delete ret.password;
        return ret;
      },
    },
  },
);

// Username duy nhất, không phân biệt hoa/thường ("Huy" == "huy").
userSchema.index({ username: 1 }, { unique: true, collation: { locale: 'vi', strength: 2 } });
// Bảng xếp hạng mọi thời đại + tính thứ hạng bằng countDocuments({ xp: { $gt } }).
userSchema.index({ xp: -1, _id: 1 });

userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
});

userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  return bcrypt.compare(plainPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
export default User;
