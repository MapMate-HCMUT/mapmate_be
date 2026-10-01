import { RESERVED_USERNAMES, USERNAME_CHANGE_COOLDOWN_DAYS } from '../constants/auth.js';
import { ERROR_CODES, PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { User } from '../models/user.model.js';
import { XpTransaction } from '../models/xpTransaction.model.js';
import { AppError } from '../utils/AppError.js';
import { getLevelInfo } from '../utils/level.js';
import { getAchievementBoard, recordDailyActivity } from './gamification.service.js';
import { clearLeaderboardCache, getAllTimeRank } from './leaderboard.service.js';
import { notifyUser } from './notification.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const USERNAME_COLLATION = { locale: 'vi', strength: 2 };

const userNotFound = () => new AppError('Không tìm thấy người dùng', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);

const getUsernameChangeAvailableAt = (user) =>
  user.username_changed_at ? new Date(user.username_changed_at.getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * DAY_MS) : null;

/**
 * Dữ liệu hiển thị của user — tuyệt đối không chứa password.
 * isOwner = true: kèm email, ngày sinh, khu vực đầy đủ. Người khác chỉ thấy thành phố + quốc gia.
 */
export const toPublicProfile = (user, { isOwner = true } = {}) => {
  const levelInfo = getLevelInfo(user.xp ?? 0);
  const homeArea = user.home_area ?? null;
  const base = {
    id: user._id,
    username: user.username,
    avatar_url: user.avatar_url ?? null,
    level: levelInfo.level,
    level_title: levelInfo.title,
    created_at: user.created_at,
  };

  if (!isOwner) {
    return { ...base, home_area: homeArea && { city: homeArea.city ?? null, country: homeArea.country ?? null } };
  }
  const availableAt = getUsernameChangeAvailableAt(user);
  return {
    ...base,
    email: user.email,
    birth_date: user.birth_date ?? null,
    home_area: homeArea,
    username_change_available_at: availableAt && availableAt > new Date() ? availableAt : null,
  };
};

const buildStats = (user, rank) => ({
  xp: user.xp,
  stars: user.stars,
  streak_days: user.streak_days,
  level: getLevelInfo(user.xp),
  rank,
  checkins: user.stats?.checkins ?? 0,
  flood_reports: user.stats?.flood_reports ?? 0,
  road_reports: user.stats?.road_reports ?? 0,
  trips_completed: user.stats?.trips_completed ?? 0,
});

const buildProfileView = async (user, options) => {
  const [rank, achievements] = await Promise.all([getAllTimeRank(user.xp), getAchievementBoard(user)]);
  return { profile: toPublicProfile(user, options), stats: buildStats(user, rank), achievements };
};

// GET /api/users/me — mở app = ghi nhận streak, rồi trả về hồ sơ + chỉ số + huy hiệu.
export const getMyProfile = async (userId) => buildProfileView(await recordDailyActivity(userId));

// GET /api/users/:id — hồ sơ công khai để chia sẻ / xem từ bảng xếp hạng (không có email).
export const getPublicProfile = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw userNotFound();
  return buildProfileView(user, { isOwner: false });
};

const isReservedUsername = (username) => RESERVED_USERNAMES.includes(username.toLowerCase());

// GET /api/users/check-username — kiểm tra nhanh khi người dùng đang gõ (đăng ký / đổi tên).
export const checkUsernameAvailability = async (username, currentUserId) => {
  if (isReservedUsername(username)) return { available: false, reason: 'Tên này được dành riêng cho hệ thống' };
  const owner = await User.findOne({ username }, { _id: 1 }).collation(USERNAME_COLLATION).lean();
  if (owner && String(owner._id) !== String(currentUserId)) return { available: false, reason: 'Tên người dùng này đã có người dùng' };
  return { available: true, reason: null };
};

// PATCH /api/users/me — sửa username (giới hạn 1 lần / 14 ngày), ngày sinh, khu vực sinh sống.
export const updateMyProfile = async (userId, changes) => {
  if (Object.keys(changes).length === 0) {
    throw new AppError('Không có thông tin nào để cập nhật', HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.NOTHING_TO_UPDATE);
  }
  const current = await User.findById(userId, { username: 1, username_changed_at: 1 }).lean();
  if (!current) throw userNotFound();

  const update = { ...changes };
  const isRenaming = changes.username !== undefined && changes.username !== current.username;
  if (changes.username !== undefined && !isRenaming) delete update.username;

  if (isRenaming) {
    if (isReservedUsername(changes.username)) {
      throw new AppError('Tên này được dành riêng cho hệ thống', HTTP_STATUS.CONFLICT, ERROR_CODES.USERNAME_TAKEN, [
        { field: 'username', message: 'Tên này được dành riêng cho hệ thống' },
      ]);
    }
    const availableAt = getUsernameChangeAvailableAt(current);
    if (availableAt && availableAt > new Date()) {
      const message = `Bạn chỉ được đổi tên 1 lần mỗi ${USERNAME_CHANGE_COOLDOWN_DAYS} ngày. Lần đổi tiếp theo: ${availableAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`;
      throw new AppError(message, HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.USERNAME_CHANGE_TOO_SOON, [{ field: 'username', message }]);
    }
    update.username_changed_at = new Date();
  }

  const user = await User.findByIdAndUpdate(userId, { $set: update }, { returnDocument: 'after', runValidators: true }).lean();
  if (isRenaming || changes.avatar_url !== undefined) clearLeaderboardCache();
  return { profile: toPublicProfile(user) };
};

// PATCH /api/users/me/password — phải nhập đúng mật khẩu hiện tại.
export const changeMyPassword = async (userId, { current_password: currentPassword, new_password: newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw userNotFound();

  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Mật khẩu hiện tại không đúng', HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.WRONG_CURRENT_PASSWORD, [
      { field: 'current_password', message: 'Mật khẩu hiện tại không đúng' },
    ]);
  }
  if (currentPassword === newPassword) {
    throw new AppError('Mật khẩu mới phải khác mật khẩu hiện tại', HTTP_STATUS.BAD_REQUEST, PROFILE_ERROR_CODES.SAME_PASSWORD, [
      { field: 'new_password', message: 'Mật khẩu mới phải khác mật khẩu hiện tại' },
    ]);
  }
  user.password = newPassword; // pre('save') sẽ băm bcrypt
  await user.save();
  await notifyUser(userId, {
    type: NOTIFICATION_TYPES.SECURITY,
    icon: '🔐',
    title: 'Mật khẩu của bạn vừa được thay đổi',
    body: 'Nếu không phải bạn thực hiện, hãy đổi lại mật khẩu ngay.',
  });
};

// GET /api/users/me/xp-history — phân trang kiểu cursor theo created_at (đi theo index { user_id, created_at: -1 }).
export const getMyXpHistory = async (userId, { limit, before }) => {
  const filter = { user_id: userId, ...(before && { created_at: { $lt: before } }) };
  const rows = await XpTransaction.find(filter, { action: 1, xp: 1, stars: 1, created_at: 1 })
    .sort({ created_at: -1 })
    .limit(limit + 1) // lấy dư 1 để biết còn trang sau không
    .lean();

  const items = rows.slice(0, limit).map(({ _id, ...row }) => ({ id: _id, ...row }));
  const hasMore = rows.length > limit;
  return { items, next_cursor: hasMore ? items.at(-1).created_at : null };
};
