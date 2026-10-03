import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import {
  FEED_SCOPES,
  PIN_STATUS,
  POST_TYPES,
  POST_VISIBILITY,
  TRENDING_TAGS_CACHE_TTL_MS,
  TRENDING_TAGS_LIMIT,
  TRENDING_TAGS_WINDOW_DAYS,
} from '../constants/social.js';
import Place from '../models/Place.model.js';
import { PlacePin } from '../models/placePin.model.js';
import { Post } from '../models/post.model.js';
import { PostLike } from '../models/postLike.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { createMemoryCache } from '../utils/memoryCache.js';
import { toUserCard, USER_CARD_SELECT } from '../utils/userCard.js';
import { areFriends, getFriendIds } from './friend.service.js';
import { ensureItineraryShareable, toItineraryView } from './itinerary.service.js';
import { notifyUser } from './notification.service.js';
import { toPlaceView } from './place.service.js';

const DUPLICATE_KEY_ERROR = 11000;
const DAY_MS = 24 * 60 * 60 * 1000;
const { PUBLIC, FRIENDS } = POST_VISIBILITY;
const trendingCache = createMemoryCache(TRENDING_TAGS_CACHE_TTL_MS);

const fail = (message, status, code) => new AppError(message, status, code);
const postNotFound = () => fail('Không tìm thấy bài viết', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.POST_NOT_FOUND);
const postLink = (postId) => `/explore?tab=feed&post=${postId}`;
const sameId = (a, b) => String(a) === String(b);

// Nạp kèm tác giả, địa điểm, lộ trình, người được gắn thẻ — và bài gốc nếu là bài đăng lại.
const EMBEDS = [
  { path: 'author_id', select: USER_CARD_SELECT },
  { path: 'place_id' },
  { path: 'itinerary_id' },
  { path: 'tagged_user_ids', select: USER_CARD_SELECT },
];
const POPULATE = [...EMBEDS, { path: 'repost_of', populate: EMBEDS }];

const toPostView = (post, { viewerId, likedIds, repostedIds }) => ({
  id: post._id,
  type: post.type,
  content: post.content,
  rating: post.rating,
  visited: post.visited,
  tags: post.tags,
  visibility: post.visibility,
  created_at: post.created_at,
  author: toUserCard(post.author_id),
  place: post.place_id ? toPlaceView(post.place_id) : null,
  itinerary: post.itinerary_id ? toItineraryView(post.itinerary_id, viewerId) : null,
  tagged_users: (post.tagged_user_ids ?? []).map(toUserCard),
  like_count: post.like_count,
  repost_count: post.repost_count,
  liked_by_me: likedIds.has(String(post._id)),
  reposted_by_me: repostedIds.has(String(post._id)),
  is_mine: Boolean(viewerId) && sameId(post.author_id?._id, viewerId),
  is_repost: Boolean(post.is_repost),
  // Bài đăng lại: original = bài gốc (null nếu bài gốc đã bị xoá)
  original: post.is_repost && post.repost_of ? toPostView(post.repost_of, { viewerId, likedIds, repostedIds }) : null,
});

// Biến danh sách bài (đã populate) thành dữ liệu trả về, kèm "tôi đã thích / đăng lại chưa" bằng 2 truy vấn cho cả trang.
const hydrate = async (posts, viewerId) => {
  const ids = posts.flatMap((post) => [post._id, post.repost_of?._id]).filter(Boolean);
  const [likes, reposts] = viewerId && ids.length
    ? await Promise.all([
        PostLike.find({ user_id: viewerId, post_id: { $in: ids } }, { post_id: 1 }).lean(),
        Post.find({ author_id: viewerId, repost_of: { $in: ids } }, { repost_of: 1 }).lean(),
      ])
    : [[], []];
  const context = {
    viewerId,
    likedIds: new Set(likes.map((like) => String(like.post_id))),
    repostedIds: new Set(reposts.map((repost) => String(repost.repost_of))),
  };
  return posts.map((post) => toPostView(post, context));
};

const loadPostView = async (postId, viewerId) => {
  const post = await Post.findById(postId).populate(POPULATE).lean();
  return (await hydrate([post], viewerId))[0];
};

const canView = async (post, viewerId) => {
  if (post.visibility === PUBLIC) return true;
  if (!viewerId) return false;
  return sameId(post.author_id, viewerId) || areFriends(post.author_id, viewerId);
};

const getVisiblePost = async (postId, viewerId) => {
  const post = await Post.findById(postId).lean();
  if (!post || !(await canView(post, viewerId))) throw postNotFound();
  return post;
};

// ── Đăng bài ──

export const createPost = async (userId, input) => {
  const { type, content, place_id: placeId, itinerary_id: itineraryId, rating, visited, tags, tagged_user_ids: taggedIds, visibility } = input;

  if (type === POST_TYPES.PLACE && !(await Place.exists({ _id: placeId }))) {
    throw fail('Không tìm thấy địa điểm', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.PLACE_NOT_FOUND);
  }
  if (type === POST_TYPES.ITINERARY) await ensureItineraryShareable(userId, itineraryId, visibility);

  if (taggedIds.length > 0) {
    const friendIds = new Set((await getFriendIds(userId)).map(String));
    if (taggedIds.some((id) => !friendIds.has(String(id)))) {
      throw fail('Bạn chỉ có thể gắn thẻ bạn bè của mình', HTTP_STATUS.BAD_REQUEST, EXPLORE_ERROR_CODES.NOT_FRIENDS);
    }
  }

  const post = await Post.create({
    author_id: userId, type, content, tags, visibility,
    place_id: type === POST_TYPES.PLACE ? placeId : null,
    itinerary_id: type === POST_TYPES.ITINERARY ? itineraryId : null,
    rating: type === POST_TYPES.PLACE ? rating ?? null : null,
    visited: type === POST_TYPES.PLACE && visited,
    tagged_user_ids: taggedIds,
  });

  // "Mình đã đến đây" => tự ghim địa điểm vào danh sách Đã đi (không ghi đè ghi chú cũ).
  if (post.visited) {
    await PlacePin.updateOne(
      { user_id: userId, place_id: placeId },
      { $set: { status: PIN_STATUS.VISITED, ...(rating && { rating }) }, $setOnInsert: { visited_on: new Date() } },
      { upsert: true },
    );
  }

  if (taggedIds.length > 0) {
    const author = await User.findById(userId, { username: 1 }).lean();
    await Promise.all(taggedIds.map((id) => notifyUser(id, {
      type: NOTIFICATION_TYPES.POST_TAGGED, icon: '🏷️', link: postLink(post._id),
      title: `${author.username} đã gắn thẻ bạn trong một bài viết`, body: content.slice(0, 120),
    })));
  }
  trendingCache.clear();
  return loadPostView(post._id, userId);
};

// Đăng lại: luôn trỏ về bài gốc (đăng lại 1 bài đăng lại = đăng lại bài gốc). Chỉ bài công khai mới đăng lại được.
export const repost = async (userId, postId, { content }) => {
  const target = await getVisiblePost(postId, userId);
  const rootId = target.is_repost && target.repost_of ? target.repost_of : target._id;
  const root = sameId(rootId, target._id) ? target : await Post.findById(rootId).lean();
  if (!root) throw postNotFound();
  if (root.visibility !== PUBLIC) throw fail('Chỉ đăng lại được bài viết công khai', HTTP_STATUS.FORBIDDEN, EXPLORE_ERROR_CODES.POST_NOT_SHAREABLE);

  let created;
  try {
    created = await Post.create({ author_id: userId, type: root.type, content, visibility: PUBLIC, repost_of: root._id, is_repost: true });
  } catch (error) {
    if (error.code !== DUPLICATE_KEY_ERROR) throw error;
    const existing = await Post.findOne({ author_id: userId, repost_of: root._id }, { _id: 1 }).lean();
    return loadPostView(existing._id, userId); // đã đăng lại rồi => trả về bài cũ, không tăng số đếm
  }
  await Post.updateOne({ _id: root._id }, { $inc: { repost_count: 1 } });

  if (!sameId(root.author_id, userId)) {
    const me = await User.findById(userId, { username: 1 }).lean();
    await notifyUser(root.author_id, {
      type: NOTIFICATION_TYPES.POST_REPOSTED, icon: '🔁', link: postLink(root._id),
      title: `${me.username} đã đăng lại bài viết của bạn`, body: root.content.slice(0, 120),
    });
  }
  return loadPostView(created._id, userId);
};

export const undoRepost = async (userId, postId) => {
  const removed = await Post.findOneAndDelete({ author_id: userId, repost_of: postId });
  if (removed) await Post.updateOne({ _id: postId, repost_count: { $gt: 0 } }, { $inc: { repost_count: -1 } });
};

export const deletePost = async (userId, postId) => {
  const post = await Post.findOneAndDelete({ _id: postId, author_id: userId });
  if (!post) throw postNotFound();
  if (post.repost_of) {
    await Post.updateOne({ _id: post.repost_of, repost_count: { $gt: 0 } }, { $inc: { repost_count: -1 } });
  } else {
    await Post.deleteMany({ repost_of: postId }); // xoá bài gốc => xoá luôn các bài đăng lại của nó
  }
  await PostLike.deleteMany({ post_id: postId });
  trendingCache.clear();
};

// ── Thích ──

export const likePost = async (userId, postId) => {
  await getVisiblePost(postId, userId);
  try {
    await PostLike.create({ post_id: postId, user_id: userId });
  } catch (error) {
    if (error.code !== DUPLICATE_KEY_ERROR) throw error;
    return { liked: true }; // đã thích từ trước => không cộng thêm
  }
  await Post.updateOne({ _id: postId }, { $inc: { like_count: 1 } });
  return { liked: true };
};

export const unlikePost = async (userId, postId) => {
  const result = await PostLike.deleteOne({ post_id: postId, user_id: userId });
  if (result.deletedCount > 0) await Post.updateOne({ _id: postId, like_count: { $gt: 0 } }, { $inc: { like_count: -1 } });
  return { liked: false };
};

// ── Bảng tin ──

const buildFeedFilter = async (viewerId, { scope, author_id: authorId }) => {
  if (authorId) {
    // Tường của 1 người: chính chủ thấy tất cả, bạn bè thấy cả bài "Bạn bè", người lạ chỉ thấy bài công khai.
    if (viewerId && sameId(authorId, viewerId)) return { author_id: authorId };
    const friends = viewerId && (await areFriends(authorId, viewerId));
    return { author_id: authorId, visibility: friends ? { $in: [PUBLIC, FRIENDS] } : PUBLIC };
  }
  if (scope === FEED_SCOPES.MINE) return { author_id: viewerId };
  if (scope === FEED_SCOPES.FRIENDS) {
    return { author_id: { $in: [...(await getFriendIds(viewerId)), viewerId] }, visibility: { $in: [PUBLIC, FRIENDS] } };
  }
  return { visibility: PUBLIC };
};

// GET /api/posts — phân trang cursor theo created_at.
export const getFeed = async (viewerId, query) => {
  const { tag, place_id: placeId, before, limit } = query;
  const filter = {
    ...(await buildFeedFilter(viewerId, query)),
    ...(tag && { tags: tag }),
    ...(placeId && { place_id: placeId }),
    ...(before && { created_at: { $lt: before } }),
  };
  const rows = await Post.find(filter).sort({ created_at: -1 }).limit(limit + 1).populate(POPULATE).lean();
  const page = rows.slice(0, limit);
  return { items: await hydrate(page, viewerId), next_cursor: rows.length > limit ? page.at(-1).created_at : null };
};

export const getPost = async (postId, viewerId) => {
  await getVisiblePost(postId, viewerId);
  return loadPostView(postId, viewerId);
};

// ── Gửi bài viết cho bạn bè (qua thông báo) ──

export const sharePostWithFriends = async (userId, postId, { friend_ids: friendIds, message }) => {
  const post = await getVisiblePost(postId, userId);
  // Bài "Bạn bè" của người khác: người nhận có thể không xem được => chỉ cho gửi bài công khai hoặc bài của chính mình.
  if (post.visibility !== PUBLIC && !sameId(post.author_id, userId)) {
    throw fail('Bài viết này chỉ dành cho bạn bè của người đăng, không thể gửi tiếp', HTTP_STATUS.FORBIDDEN, EXPLORE_ERROR_CODES.POST_NOT_SHAREABLE);
  }
  const myFriends = new Set((await getFriendIds(userId)).map(String));
  if (friendIds.some((id) => !myFriends.has(String(id)))) {
    throw fail('Bạn chỉ có thể gửi cho bạn bè của mình', HTTP_STATUS.BAD_REQUEST, EXPLORE_ERROR_CODES.NOT_FRIENDS);
  }

  const me = await User.findById(userId, { username: 1 }).lean();
  await Promise.all(friendIds.map((id) => notifyUser(id, {
    type: NOTIFICATION_TYPES.POST_SHARED, icon: '📨', link: postLink(post._id),
    title: `${me.username} đã chia sẻ một bài viết với bạn`, body: message || post.content.slice(0, 120),
  })));
  return { sent: friendIds.length };
};

// ── Hashtag nổi bật (bài công khai trong 14 ngày gần nhất) ──

export const getTrendingTags = () =>
  trendingCache.wrap('trending', async () => {
    const rows = await Post.aggregate([
      { $match: { visibility: PUBLIC, created_at: { $gte: new Date(Date.now() - TRENDING_TAGS_WINDOW_DAYS * DAY_MS) } } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: TRENDING_TAGS_LIMIT },
    ]);
    return { items: rows.map((row) => ({ tag: row._id, count: row.count })) };
  });
