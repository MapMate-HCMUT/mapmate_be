import mongoose from 'mongoose';
import { ERROR_CODES } from '../constants/errorCodes.js';
import { ACTION_STAT_FIELD, BADGES, XP_ACTIONS, XP_REWARDS } from '../constants/gamification.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { UserAchievement } from '../models/userAchievement.model.js';
import { User } from '../models/user.model.js';
import { XpTransaction } from '../models/xpTransaction.model.js';
import { AppError } from '../utils/AppError.js';
import { localDayDiff, toLocalDateKey } from '../utils/dateRange.js';
import { getLevelInfo } from '../utils/level.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import { notifyUser } from './notification.service.js';

const DUPLICATE_KEY_ERROR = 11000;
const AFTER_UPDATE = { returnDocument: 'after' };

const userNotFound = () => new AppError('Không tìm thấy người dùng', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);

const getBadgeProgress = (user, badge) => (badge.stat === 'streak_days' ? user.streak_days : user.stats?.[badge.stat] ?? 0);

// Mở khóa các huy hiệu vừa đủ điều kiện; trả về danh sách huy hiệu mới.
const unlockEligibleBadges = async (user, session) => {
  const eligible = BADGES.filter((badge) => getBadgeProgress(user, badge) >= badge.threshold);
  if (eligible.length === 0) return [];

  const owned = await UserAchievement.find(
    { user_id: user._id, badge_code: { $in: eligible.map((badge) => badge.code) } },
    { badge_code: 1 },
  ).session(session).lean();
  const ownedCodes = new Set(owned.map((item) => item.badge_code));
  const newBadges = eligible.filter((badge) => !ownedCodes.has(badge.code));
  if (newBadges.length === 0) return [];

  await UserAchievement.insertMany(
    newBadges.map((badge) => ({
      user_id: user._id, badge_code: badge.code, badge_name: badge.name, badge_icon: badge.icon, xp_reward: badge.xpReward,
    })),
    { session },
  );
  await XpTransaction.insertMany(
    newBadges.map((badge) => ({
      user_id: user._id, action: XP_ACTIONS.BADGE_UNLOCKED, xp: badge.xpReward, ref_key: `badge:${badge.code}`,
    })),
    { session },
  );
  return newBadges;
};

/**
 * Cộng thưởng cho 1 hành động — dùng chung cho check-in, báo ngập, hoàn thành chuyến đi...
 * Chạy trong transaction: sổ XP, tổng điểm, bộ đếm, huy hiệu, level luôn khớp nhau.
 * @param {string} userId
 * @param {string} action  Một giá trị trong XP_ACTIONS
 * @param {{ refKey?: string }} options  refKey giống nhau => chỉ thưởng 1 lần (idempotent)
 */
export const rewardAction = async (userId, action, { refKey } = {}) => {
  const reward = XP_REWARDS[action];
  if (!reward) throw new Error(`Unknown XP action: ${action}`);

  try {
    return await mongoose.connection.transaction(async (session) => {
      await XpTransaction.create([{ user_id: userId, action, xp: reward.xp, stars: reward.stars, ref_key: refKey }], { session });

      const statField = ACTION_STAT_FIELD[action];
      const increments = { xp: reward.xp, stars: reward.stars, 'stats.total_actions': 1 };
      if (statField) increments[`stats.${statField}`] = 1;

      const user = await User.findByIdAndUpdate(userId, { $inc: increments }, { ...AFTER_UPDATE, session }).lean();
      if (!user) throw userNotFound();

      const newBadges = await unlockEligibleBadges(user, session);
      const badgeXp = newBadges.reduce((sum, badge) => sum + badge.xpReward, 0);
      const totalXp = user.xp + badgeXp;
      const { level } = getLevelInfo(totalXp);

      if (badgeXp > 0 || level !== user.level) {
        await User.updateOne({ _id: userId }, { $inc: { xp: badgeXp }, $set: { level } }, { session });
      }

      // Thông báo nằm trong cùng transaction => chỉ gửi khi phần thưởng thực sự được ghi nhận.
      for (const badge of newBadges) {
        await notifyUser(userId, {
          type: NOTIFICATION_TYPES.BADGE_UNLOCKED, icon: badge.icon, link: '/profile',
          title: `Bạn đã mở khoá huy hiệu "${badge.name}"`, body: `${badge.description} · +${badge.xpReward} XP`,
        }, session);
      }
      if (level > user.level) {
        const { title } = getLevelInfo(totalXp);
        await notifyUser(userId, {
          type: NOTIFICATION_TYPES.LEVEL_UP, icon: '⭐', link: '/profile',
          title: `Chúc mừng! Bạn đã lên Lv.${level}`, body: `Danh hiệu mới: ${title}`,
        }, session);
      }

      return {
        awarded: true,
        xp_earned: reward.xp + badgeXp,
        stars_earned: reward.stars,
        total_xp: totalXp,
        level,
        level_up: level > user.level,
        new_badges: newBadges.map(({ code, name, icon, xpReward }) => ({ code, name, icon, xp_reward: xpReward })),
      };
    });
  } catch (error) {
    // Đã thưởng cho refKey này rồi (VD check-in lại cùng 1 trạm) => không cộng thêm, không coi là lỗi.
    if (error.code === DUPLICATE_KEY_ERROR && refKey) return { awarded: false, reason: 'ALREADY_REWARDED' };
    throw error;
  }
};

/**
 * Ghi nhận người dùng mở app hôm nay: cập nhật chuỗi ngày (streak) theo giờ VN.
 * Gọi nhiều lần trong ngày chỉ tốn 1 lần đọc, không ghi.
 */
export const recordDailyActivity = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) throw userNotFound();

  const dayDiff = user.last_active_at ? localDayDiff(user.last_active_at) : null;
  if (dayDiff === 0) return user;

  const streak = dayDiff === 1 ? user.streak_days + 1 : 1;
  // Điều kiện last_active_at cũ => nếu 2 request cùng lúc, chỉ 1 request được tăng streak.
  const updated = await User.findOneAndUpdate(
    { _id: userId, last_active_at: user.last_active_at },
    { $set: { last_active_at: new Date(), streak_days: streak } },
    AFTER_UPDATE,
  ).lean();
  if (!updated) return User.findById(userId).lean();

  await rewardAction(userId, XP_ACTIONS.DAILY_STREAK, { refKey: `streak:${toLocalDateKey()}` });
  return User.findById(userId).lean();
};

// Danh mục huy hiệu kèm trạng thái đã mở / tiến độ của người dùng — phục vụ màn hình Hồ sơ.
export const getAchievementBoard = async (user) => {
  const unlocked = await UserAchievement.find({ user_id: user._id }, { badge_code: 1, unlocked_at: 1 }).lean();
  const unlockedAt = new Map(unlocked.map((item) => [item.badge_code, item.unlocked_at]));

  return BADGES.map((badge) => ({
    code: badge.code,
    name: badge.name,
    icon: badge.icon,
    description: badge.description,
    xp_reward: badge.xpReward,
    unlocked: unlockedAt.has(badge.code),
    unlocked_at: unlockedAt.get(badge.code) ?? null,
    progress: Math.min(getBadgeProgress(user, badge), badge.threshold),
    threshold: badge.threshold,
  }));
};
