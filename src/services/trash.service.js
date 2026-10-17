// Thùng rác: bài viết đã xoá + ảnh / video bị bỏ khi chỉnh bài. Giữ 30 ngày => khôi phục được; quá hạn (hoặc người dùng
// bấm "Xoá vĩnh viễn") => xoá hẳn: bình luận, lượt thích, bài đăng lại của bài đó và file trên Cloudinary.
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { POST_MEDIA, TRASH, TRASH_KINDS } from '../constants/social.js';
import Itinerary from '../models/Itinerary.model.js';
import Place from '../models/Place.model.js';
import { Post } from '../models/post.model.js';
import { TrashItem } from '../models/trashItem.model.js';
import { AppError } from '../utils/AppError.js';
import { deleteMedia, toMediaView } from './media.service.js';
import { clearTrendingCache, purgePostRelations, refreshCommunityRating } from './post.service.js';

const DUPLICATE_KEY_ERROR = 11000;
const PREVIEW_LENGTH = 160;

const fail = (message, status, code) => new AppError(message, status, code);
const notFound = () => fail('Không tìm thấy mục này trong thùng rác', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.TRASH_ITEM_NOT_FOUND);
const blocked = (message) => fail(message, HTTP_STATUS.CONFLICT, EXPLORE_ERROR_CODES.TRASH_RESTORE_BLOCKED);

const toItemView = (item, { places, itineraries, livePostIds }) => {
  const base = { id: item._id, kind: item.kind, post_id: item.post_id, deleted_at: item.deleted_at, expires_at: item.expires_at };
  if (item.kind === TRASH_KINDS.MEDIA) return { ...base, media: toMediaView(item.media), post_exists: livePostIds.has(String(item.post_id)) };
  const { post } = item;
  return {
    ...base,
    post: {
      type: post.type,
      content: (post.content ?? '').slice(0, PREVIEW_LENGTH),
      media: (post.media ?? []).map(toMediaView),
      is_repost: Boolean(post.is_repost),
      place_name: post.place_id ? places.get(String(post.place_id)) ?? null : null,
      itinerary_name: post.itinerary_id ? itineraries.get(String(post.itinerary_id)) ?? null : null,
      like_count: post.like_count ?? 0,
      comment_count: post.comment_count ?? 0,
      created_at: post.created_at,
    },
  };
};

// GET /api/trash — mới xoá trước. Mục quá hạn của người này được dọn luôn (không chờ lượt dọn theo giờ).
export const listTrash = async (userId) => {
  await purgeExpired({ user_id: userId });
  const items = await TrashItem.find({ user_id: userId }).sort({ deleted_at: -1 }).limit(TRASH.LIST_LIMIT).lean();
  const posts = items.filter((item) => item.kind === TRASH_KINDS.POST).map((item) => item.post);
  const mediaPostIds = items.filter((item) => item.kind === TRASH_KINDS.MEDIA).map((item) => item.post_id);
  const [places, itineraries, live] = await Promise.all([
    Place.find({ _id: { $in: posts.map((post) => post.place_id).filter(Boolean) } }, { name: 1 }).lean(),
    Itinerary.find({ _id: { $in: posts.map((post) => post.itinerary_id).filter(Boolean) } }, { name: 1 }).lean(),
    Post.find({ _id: { $in: mediaPostIds }, author_id: userId }, { _id: 1 }).lean(),
  ]);
  const context = {
    places: new Map(places.map((place) => [String(place._id), place.name])),
    itineraries: new Map(itineraries.map((itinerary) => [String(itinerary._id), itinerary.name])),
    livePostIds: new Set(live.map((post) => String(post._id))),
  };
  return { items: items.map((item) => toItemView(item, context)), retention_days: TRASH.RETENTION_DAYS };
};

const findOwnItem = async (userId, itemId) => {
  const item = await TrashItem.findOne({ _id: itemId, user_id: userId }).lean();
  if (!item) throw notFound();
  return item;
};

// Bài về lại đúng như cũ (cùng id, ngày đăng, lượt thích, bình luận). Ghi thẳng bản chụp — không qua mongoose để giữ nguyên created_at.
const restorePost = async (item) => {
  const { post } = item;
  try {
    await Post.collection.insertOne(post);
  } catch (error) {
    // Bài đăng lại: trong lúc bài cũ nằm thùng rác người dùng đã đăng lại bài gốc lần nữa (mỗi người chỉ đăng lại 1 lần)
    if (error.code === DUPLICATE_KEY_ERROR) throw blocked('Bạn đã đăng lại bài viết này rồi — không khôi phục được bản cũ');
    throw error;
  }
  if (post.repost_of) await Post.updateOne({ _id: post.repost_of }, { $inc: { repost_count: 1 } });
  if (post.place_id && post.rating) await refreshCommunityRating(post.place_id);
  clearTrendingCache();
  return { kind: TRASH_KINDS.POST, post_id: post._id };
};

// Ảnh / video về lại cuối bài đang chứa nó
const restoreMedia = async (userId, item) => {
  const post = await Post.findOne({ _id: item.post_id, author_id: userId }, { media: 1 }).lean();
  if (!post) {
    const postInTrash = await TrashItem.exists({ user_id: userId, kind: TRASH_KINDS.POST, post_id: item.post_id });
    throw blocked(postInTrash ? 'Bài viết chứa ảnh / video này đang ở thùng rác — hãy khôi phục bài viết trước' : 'Bài viết chứa ảnh / video này không còn nữa');
  }
  const media = post.media ?? [];
  if (media.some((existing) => existing.public_id === item.media.public_id)) return { kind: TRASH_KINDS.MEDIA, post_id: post._id };
  if (media.length >= POST_MEDIA.MAX_ITEMS) throw blocked(`Bài viết đã đủ ${POST_MEDIA.MAX_ITEMS} ảnh / video — bỏ bớt rồi khôi phục lại`);
  if (item.media.resource_type === 'video' && media.filter((existing) => existing.resource_type === 'video').length >= POST_MEDIA.MAX_VIDEOS) {
    throw blocked(`Mỗi bài tối đa ${POST_MEDIA.MAX_VIDEOS} video — bỏ video hiện tại rồi khôi phục lại`);
  }
  await Post.updateOne({ _id: post._id }, { $push: { media: item.media }, $set: { edited_at: new Date() } });
  return { kind: TRASH_KINDS.MEDIA, post_id: post._id };
};

// POST /api/trash/:id/restore
export const restoreTrashItem = async (userId, itemId) => {
  const item = await findOwnItem(userId, itemId);
  const restored = item.kind === TRASH_KINDS.POST ? await restorePost(item) : await restoreMedia(userId, item);
  await TrashItem.deleteOne({ _id: item._id });
  return restored;
};

// Xoá hẳn 1 mục: bài viết => cả dữ liệu đi kèm + ảnh của chính bài + ảnh của bài đó đang nằm riêng trong thùng rác
const purgeItems = async (items) => {
  if (!items.length) return 0;
  const posts = items.filter((item) => item.kind === TRASH_KINDS.POST);
  const postIds = posts.map((item) => item.post_id);
  const orphanMedia = postIds.length ? await TrashItem.find({ kind: TRASH_KINDS.MEDIA, post_id: { $in: postIds } }).lean() : [];
  const media = [...posts.flatMap((item) => item.post.media ?? []), ...[...items, ...orphanMedia].filter((item) => item.kind === TRASH_KINDS.MEDIA).map((item) => item.media)];
  await Promise.all(postIds.map(purgePostRelations));
  await deleteMedia([...new Map(media.map((item) => [item.public_id, item])).values()]);
  await TrashItem.deleteMany({ _id: { $in: [...items, ...orphanMedia].map((item) => item._id) } });
  return items.length;
};

// DELETE /api/trash/:id
export const deleteTrashItem = async (userId, itemId) => {
  await purgeItems([await findOwnItem(userId, itemId)]);
};

// DELETE /api/trash — dọn sạch thùng rác
export const emptyTrash = async (userId) => {
  const items = await TrashItem.find({ user_id: userId }).lean();
  return { deleted: await purgeItems(items) };
};

const purgeExpired = async (filter = {}) => {
  const expired = await TrashItem.find({ ...filter, expires_at: { $lte: new Date() } }).limit(TRASH.PURGE_BATCH).lean();
  return purgeItems(expired);
};

export const startTrashCleanup = () => {
  const run = () => purgeExpired().then((count) => count && console.log(`[trash] đã xoá vĩnh viễn ${count} mục quá hạn`)).catch((error) => console.warn('[trash] dọn thùng rác lỗi:', error.message));
  setTimeout(run, TRASH.PURGE_FIRST_DELAY_MS).unref();
  setInterval(run, TRASH.PURGE_INTERVAL_MS).unref();
};
