import { ERROR_CODES, EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import {
  FRIEND_SUGGESTION_LIMIT,
  FRIENDSHIP_STATUS,
  MAX_PENDING_FRIEND_REQUESTS,
  RELATIONSHIP,
  USER_SEARCH_LIMIT,
} from '../constants/social.js';
import { buildPairKey, Friendship } from '../models/friendship.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { escapeRegExp } from '../utils/text.js';
import { toUserCard, USER_CARD_FIELDS } from '../utils/userCard.js';
import { notifyUser } from './notification.service.js';

const DUPLICATE_KEY_ERROR = 11000;
const FRIENDS_TAB_LINK = '/explore?tab=friends';
const { PENDING, ACCEPTED } = FRIENDSHIP_STATUS;

const fail = (message, status, code) => new AppError(message, status, code);
const involving = (userId) => ({ $or: [{ requester_id: userId }, { recipient_id: userId }] });
const otherSide = (friendship, userId) =>
  String(friendship.requester_id) === String(userId) ? friendship.recipient_id : friendship.requester_id;

// ── Truy vấn quan hệ (dùng chung cho bài viết, lộ trình, hồ sơ) ──

export const getFriendIds = async (userId) => {
  const rows = await Friendship.find({ status: ACCEPTED, ...involving(userId) }, { requester_id: 1, recipient_id: 1 }).lean();
  return rows.map((row) => otherSide(row, userId));
};

export const areFriends = async (userA, userB) =>
  Boolean(await Friendship.exists({ pair_key: buildPairKey(userA, userB), status: ACCEPTED }));

const toRelationship = (friendship, viewerId) => {
  if (!friendship) return { status: RELATIONSHIP.NONE, request_id: null };
  if (friendship.status === ACCEPTED) return { status: RELATIONSHIP.FRIENDS, request_id: null };
  const sentByMe = String(friendship.requester_id) === String(viewerId);
  return { status: sentByMe ? RELATIONSHIP.PENDING_SENT : RELATIONSHIP.PENDING_RECEIVED, request_id: friendship._id };
};

// Quan hệ giữa người xem và nhiều người khác chỉ bằng 1 truy vấn (theo index pair_key).
export const getRelationshipMap = async (viewerId, otherIds) => {
  if (!viewerId || otherIds.length === 0) return new Map();
  const rows = await Friendship.find({ pair_key: { $in: otherIds.map((id) => buildPairKey(viewerId, id)) } }).lean();
  const byPair = new Map(rows.map((row) => [row.pair_key, row]));
  return new Map(
    otherIds.map((id) => [
      String(id),
      String(id) === String(viewerId) ? { status: RELATIONSHIP.SELF, request_id: null } : toRelationship(byPair.get(buildPairKey(viewerId, id)), viewerId),
    ]),
  );
};

export const getRelationship = async (viewerId, otherId) => (await getRelationshipMap(viewerId, [otherId])).get(String(otherId));

const withRelationship = async (viewerId, users) => {
  const relationships = await getRelationshipMap(viewerId, users.map((user) => user._id));
  return users.map((user) => ({ ...toUserCard(user), relationship: relationships.get(String(user._id)) }));
};

// ── Kết bạn ──

export const sendFriendRequest = async (userId, targetId) => {
  if (String(userId) === String(targetId)) throw fail('Bạn không thể kết bạn với chính mình', HTTP_STATUS.BAD_REQUEST, EXPLORE_ERROR_CODES.CANNOT_FRIEND_SELF);
  const [me, target] = await Promise.all([User.findById(userId, { username: 1 }).lean(), User.findById(targetId, { username: 1 }).lean()]);
  if (!target) throw fail('Không tìm thấy người dùng', HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND);

  const pairKey = buildPairKey(userId, targetId);
  const existing = await Friendship.findOne({ pair_key: pairKey }).lean();
  if (existing?.status === ACCEPTED) throw fail('Hai bạn đã là bạn bè', HTTP_STATUS.CONFLICT, EXPLORE_ERROR_CODES.ALREADY_FRIENDS);
  if (existing && String(existing.requester_id) === String(userId)) {
    throw fail('Bạn đã gửi lời mời cho người này rồi', HTTP_STATUS.CONFLICT, EXPLORE_ERROR_CODES.FRIEND_REQUEST_EXISTS);
  }
  // Người kia đã mời mình trước => bấm "Kết bạn" coi như đồng ý luôn.
  if (existing) return acceptFriendRequest(userId, existing._id);

  const pendingCount = await Friendship.countDocuments({ requester_id: userId, status: PENDING });
  if (pendingCount >= MAX_PENDING_FRIEND_REQUESTS) {
    throw fail('Bạn đang có quá nhiều lời mời chưa được trả lời', HTTP_STATUS.TOO_MANY_REQUESTS, EXPLORE_ERROR_CODES.TOO_MANY_PENDING_REQUESTS);
  }

  let friendship;
  try {
    friendship = await Friendship.create({ requester_id: userId, recipient_id: targetId, pair_key: pairKey });
  } catch (error) {
    // 2 người bấm kết bạn cùng lúc => unique pair_key chỉ cho 1 bản ghi
    if (error.code === DUPLICATE_KEY_ERROR) throw fail('Lời mời đã tồn tại', HTTP_STATUS.CONFLICT, EXPLORE_ERROR_CODES.FRIEND_REQUEST_EXISTS);
    throw error;
  }
  await notifyUser(targetId, {
    type: NOTIFICATION_TYPES.FRIEND_REQUEST, icon: '🤝', link: FRIENDS_TAB_LINK,
    title: `${me.username} muốn kết bạn với bạn`, body: 'Vào mục Bạn bè để đồng ý hoặc từ chối.',
  });
  return { relationship: { status: RELATIONSHIP.PENDING_SENT, request_id: friendship._id } };
};

export const acceptFriendRequest = async (userId, requestId) => {
  const friendship = await Friendship.findOneAndUpdate(
    { _id: requestId, recipient_id: userId, status: PENDING },
    { $set: { status: ACCEPTED, accepted_at: new Date() } },
    { returnDocument: 'after' },
  ).lean();
  if (!friendship) throw fail('Không tìm thấy lời mời kết bạn', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.FRIEND_REQUEST_NOT_FOUND);

  const me = await User.findById(userId, { username: 1 }).lean();
  await notifyUser(friendship.requester_id, {
    type: NOTIFICATION_TYPES.FRIEND_ACCEPTED, icon: '🎉', link: FRIENDS_TAB_LINK,
    title: `${me.username} đã đồng ý kết bạn`, body: 'Giờ hai bạn có thể chia sẻ địa điểm và lộ trình cho nhau.',
  });
  return { relationship: { status: RELATIONSHIP.FRIENDS, request_id: null } };
};

// Từ chối (người nhận) hoặc thu hồi (người gửi) lời mời đang chờ.
export const removeFriendRequest = async (userId, requestId) => {
  const result = await Friendship.deleteOne({ _id: requestId, status: PENDING, ...involving(userId) });
  if (result.deletedCount === 0) throw fail('Không tìm thấy lời mời kết bạn', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.FRIEND_REQUEST_NOT_FOUND);
  return { relationship: { status: RELATIONSHIP.NONE, request_id: null } };
};

export const unfriend = async (userId, otherId) => {
  const result = await Friendship.deleteOne({ pair_key: buildPairKey(userId, otherId), status: ACCEPTED });
  if (result.deletedCount === 0) throw fail('Hai bạn chưa là bạn bè', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.NOT_FRIENDS);
  return { relationship: { status: RELATIONSHIP.NONE, request_id: null } };
};

// ── Danh sách ──

const loadUserCards = async (ids) => {
  const users = await User.find({ _id: { $in: ids } }, USER_CARD_FIELDS).lean();
  return new Map(users.map((user) => [String(user._id), toUserCard(user)]));
};

export const listFriends = async (userId) => {
  const rows = await Friendship.find({ status: ACCEPTED, ...involving(userId) }).sort({ accepted_at: -1 }).lean();
  const cards = await loadUserCards(rows.map((row) => otherSide(row, userId)));
  const items = rows.map((row) => ({ ...cards.get(String(otherSide(row, userId))), friends_since: row.accepted_at })).filter((item) => item.id);
  return { items, total: items.length };
};

export const listFriendRequests = async (userId) => {
  const rows = await Friendship.find({ status: PENDING, ...involving(userId) }).sort({ created_at: -1 }).lean();
  const cards = await loadUserCards(rows.map((row) => otherSide(row, userId)));
  const toItem = (row) => ({ request_id: row._id, created_at: row.created_at, user: cards.get(String(otherSide(row, userId))) });
  return {
    incoming: rows.filter((row) => String(row.recipient_id) === String(userId)).map(toItem).filter((item) => item.user),
    outgoing: rows.filter((row) => String(row.requester_id) === String(userId)).map(toItem).filter((item) => item.user),
  };
};

// Tìm người theo username (khớp đầu tên, không phân biệt hoa/thường).
export const searchUsers = async (userId, q) => {
  const users = await User.find(
    { _id: { $ne: userId }, username: { $regex: `^${escapeRegExp(q)}`, $options: 'i' } },
    USER_CARD_FIELDS,
  ).sort({ xp: -1 }).limit(USER_SEARCH_LIMIT).lean();
  return { items: await withRelationship(userId, users) };
};

// Gợi ý: những người tích cực nhất mà mình chưa kết bạn / chưa có lời mời.
export const suggestFriends = async (userId) => {
  const related = await Friendship.find(involving(userId), { requester_id: 1, recipient_id: 1 }).lean();
  const excluded = [userId, ...related.map((row) => otherSide(row, userId))];
  const users = await User.find({ _id: { $nin: excluded } }, USER_CARD_FIELDS).sort({ xp: -1, _id: 1 }).limit(FRIEND_SUGGESTION_LIMIT).lean();
  return { items: users.map((user) => ({ ...toUserCard(user), relationship: { status: RELATIONSHIP.NONE, request_id: null } })) };
};
