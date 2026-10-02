import mongoose from 'mongoose';
import { LEADERBOARD_CACHE_TTL_MS, LEADERBOARD_PERIODS } from '../constants/gamification.js';
import { User } from '../models/user.model.js';
import { XpTransaction } from '../models/xpTransaction.model.js';
import { createMemoryCache } from '../utils/memoryCache.js';
import { getPeriodStart } from '../utils/dateRange.js';

const leaderboardCache = createMemoryCache(LEADERBOARD_CACHE_TTL_MS);
const PUBLIC_USER_FIELDS = { username: 1, avatar_url: 1, level: 1 };

const toRanking = (entry, index) => ({
  rank: index + 1,
  user_id: entry.user_id,
  username: entry.username,
  avatar_url: entry.avatar_url,
  level: entry.level,
  score: entry.score,
});

// Mọi thời đại: đọc thẳng users.xp, đi theo index { xp: -1 } nên chỉ quét đúng `limit` document.
const queryAllTime = async (limit) => {
  const users = await User.find({ xp: { $gt: 0 } }, { ...PUBLIC_USER_FIELDS, xp: 1 })
    .sort({ xp: -1, _id: 1 })
    .limit(limit)
    .lean();
  return users.map((user, index) => toRanking({ ...user, user_id: user._id, score: user.xp }, index));
};

// Tuần/tháng: cộng XP trong sổ cái từ đầu kỳ (covering index { created_at, user_id, xp }), rồi ghép thông tin user.
const queryPeriod = async (periodStart, limit) => {
  const rows = await XpTransaction.aggregate([
    { $match: { created_at: { $gte: periodStart } } },
    { $group: { _id: '$user_id', score: { $sum: '$xp' } } },
    { $sort: { score: -1, _id: 1 } },
    { $limit: limit },
    { $lookup: { from: User.collection.name, localField: '_id', foreignField: '_id', as: 'user', pipeline: [{ $project: PUBLIC_USER_FIELDS }] } },
    { $unwind: '$user' },
  ]);
  return rows.map((row, index) => toRanking({ ...row.user, user_id: row._id, score: row.score }, index));
};

// Thứ hạng riêng của người đang đăng nhập (kể cả khi nằm ngoài top `limit`).
const getUserStanding = async (userId, periodStart) => {
  if (!periodStart) {
    const user = await User.findById(userId, { xp: 1 }).lean();
    if (!user) return null;
    const higher = await User.countDocuments({ xp: { $gt: user.xp } });
    return { rank: higher + 1, score: user.xp };
  }

  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const [mine] = await XpTransaction.aggregate([
    { $match: { user_id: userObjectId, created_at: { $gte: periodStart } } },
    { $group: { _id: null, score: { $sum: '$xp' } } },
  ]);
  const score = mine?.score ?? 0;
  const [higher] = await XpTransaction.aggregate([
    { $match: { created_at: { $gte: periodStart } } },
    { $group: { _id: '$user_id', score: { $sum: '$xp' } } },
    { $match: { score: { $gt: score } } },
    { $count: 'total' },
  ]);
  return { rank: (higher?.total ?? 0) + 1, score };
};

export const getLeaderboard = async ({ period, limit, userId }) => {
  const periodStart = getPeriodStart(period);
  const cacheKey = `${period}:${periodStart?.toISOString() ?? 'all'}:${limit}`;

  const [rankings, me] = await Promise.all([
    leaderboardCache.wrap(cacheKey, () =>
      period === LEADERBOARD_PERIODS.ALL ? queryAllTime(limit) : queryPeriod(periodStart, limit),
    ),
    userId ? getUserStanding(userId, periodStart) : null,
  ]);

  return { period, period_start: periodStart, rankings, me };
};

// Gọi khi tên/ảnh người dùng đổi để bảng xếp hạng không hiện thông tin cũ.
export const clearLeaderboardCache = () => leaderboardCache.clear();

export const getAllTimeRank = async (xp) => (await User.countDocuments({ xp: { $gt: xp } })) + 1;
