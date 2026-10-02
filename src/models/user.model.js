import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email là bắt buộc'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ'],
    },
    username: {
      type: String,
      required: [true, 'Tên người dùng là bắt buộc'],
      trim: true,
      minlength: [2, 'Tên tối thiểu 2 ký tự'],
      maxlength: [50, 'Tên tối đa 50 ký tự'],
    },
    password: {
      type: String,
      required: [true, 'Mật khẩu là bắt buộc'],
      minlength: [6, 'Mật khẩu tối thiểu 6 ký tự'],
      select: false, // Không trả về password trong query mặc định
    },
    avatar_url: {
      type: String,
      default: '',
    },
    level: {
      type: Number,
      default: 1,
      min: 1,
    },
    xp: {
      type: Number,
      default: 0,
      min: 0,
    },
    stars: {
      type: Number,
      default: 0,
      min: 0,
    },
    streak_days: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    versionKey: false,
  }
);

const User = mongoose.model('User', userSchema);
export default User;
