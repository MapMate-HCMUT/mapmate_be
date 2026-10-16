// Bình luận dưới bài viết: ai xem được bài thì xem / bình luận được (bài "Bạn bè" => chỉ bạn bè của tác giả).
// Xoá: người viết bình luận, hoặc chủ bài viết (dọn bình luận trên tường của mình).
import { EXPLORE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { NOTIFICATION_TYPES } from '../constants/notifications.js';
import { Post } from '../models/post.model.js';
import { PostComment } from '../models/postComment.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { toUserCard, USER_CARD_SELECT } from '../utils/userCard.js';
import { notifyUser } from './notification.service.js';
import { getVisiblePost, postLink } from './post.service.js';

const NOTIFY_PREVIEW_LENGTH = 120;
const sameId = (a, b) => String(a) === String(b);
const commentNotFound = () => new AppError('Không tìm thấy bình luận', HTTP_STATUS.NOT_FOUND, EXPLORE_ERROR_CODES.COMMENT_NOT_FOUND);

const toCommentView = (comment, { viewerId, postAuthorId }) => ({
  id: comment._id,
  content: comment.content,
  created_at: comment.created_at,
  author: toUserCard(comment.author_id),
  is_mine: Boolean(viewerId) && sameId(comment.author_id?._id ?? comment.author_id, viewerId),
  can_delete: Boolean(viewerId) && (sameId(comment.author_id?._id ?? comment.author_id, viewerId) || sameId(postAuthorId, viewerId)),
});

/** GET /api/posts/:id/comments — cũ trước; `after` = mốc thời gian để tải tiếp */
export const listComments = async (postId, viewerId, { after, limit }) => {
  const post = await getVisiblePost(postId, viewerId);
  const rows = await PostComment.find({ post_id: postId, ...(after && { created_at: { $gt: after } }) })
    .sort({ created_at: 1 })
    .limit(limit + 1)
    .populate({ path: 'author_id', select: USER_CARD_SELECT })
    .lean();
  const page = rows.slice(0, limit);
  return {
    items: page.map((comment) => toCommentView(comment, { viewerId, postAuthorId: post.author_id })),
    next_cursor: rows.length > limit ? page.at(-1).created_at : null,
    total: post.comment_count ?? 0,
  };
};

/** POST /api/posts/:id/comments */
export const addComment = async (userId, postId, content) => {
  const post = await getVisiblePost(postId, userId);
  const comment = await PostComment.create({ post_id: postId, author_id: userId, content });
  await Post.updateOne({ _id: postId }, { $inc: { comment_count: 1 } });
  const author = await User.findById(userId, USER_CARD_SELECT).lean();
  if (!sameId(post.author_id, userId)) {
    await notifyUser(post.author_id, {
      type: NOTIFICATION_TYPES.POST_COMMENTED, icon: '💬', link: postLink(postId),
      title: `${author.username} đã bình luận bài viết của bạn`, body: content.slice(0, NOTIFY_PREVIEW_LENGTH),
    });
  }
  return toCommentView({ ...comment.toObject(), author_id: author }, { viewerId: userId, postAuthorId: post.author_id });
};

/** DELETE /api/posts/:id/comments/:commentId — người viết bình luận hoặc chủ bài viết */
export const removeComment = async (userId, postId, commentId) => {
  const post = await Post.findById(postId, { author_id: 1 }).lean();
  if (!post) throw commentNotFound();
  const filter = { _id: commentId, post_id: postId, ...(sameId(post.author_id, userId) ? {} : { author_id: userId }) };
  const removed = await PostComment.findOneAndDelete(filter);
  if (!removed) throw commentNotFound();
  await Post.updateOne({ _id: postId, comment_count: { $gt: 0 } }, { $inc: { comment_count: -1 } });
};
