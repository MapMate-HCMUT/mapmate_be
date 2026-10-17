import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { FEED_SCOPES } from '../constants/social.js';
import {
  createPost,
  deletePost,
  getFeed,
  getPost,
  getTrendingTags,
  likePost,
  repost,
  sharePostWithFriends,
  undoRepost,
  unlikePost,
  updatePost,
} from '../services/post.service.js';
import { addComment, listComments, removeComment } from '../services/comment.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

const SCOPES_REQUIRING_LOGIN = [FEED_SCOPES.FRIENDS, FEED_SCOPES.MINE];

export const listFeed = asyncHandler(async (req, res) => {
  const query = req.validated.query;
  if (!req.user && !query.author_id && SCOPES_REQUIRING_LOGIN.includes(query.scope)) {
    throw new AppError('Bạn cần đăng nhập để xem bảng tin bạn bè', HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.TOKEN_MISSING);
  }
  return sendSuccess(res, { data: await getFeed(req.user?.id, query) });
});

export const listTrendingTags = asyncHandler(async (_req, res) => sendSuccess(res, { data: await getTrendingTags() }));

export const getOne = asyncHandler(async (req, res) => sendSuccess(res, { data: await getPost(req.validated.params.id, req.user?.id) }));

export const create = asyncHandler(async (req, res) => {
  const data = await createPost(req.user.id, req.validated.body);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã đăng bài', data });
});

export const remove = asyncHandler(async (req, res) => {
  const data = await deletePost(req.user.id, req.validated.params.id);
  return sendSuccess(res, { data, message: 'Đã chuyển bài viết vào thùng rác' });
});

export const like = asyncHandler(async (req, res) => sendSuccess(res, { data: await likePost(req.user.id, req.validated.params.id) }));
export const unlike = asyncHandler(async (req, res) => sendSuccess(res, { data: await unlikePost(req.user.id, req.validated.params.id) }));

export const createRepost = asyncHandler(async (req, res) => {
  const data = await repost(req.user.id, req.validated.params.id, req.validated.body);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: 'Đã đăng lại', data });
});

export const removeRepost = asyncHandler(async (req, res) => {
  await undoRepost(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã bỏ đăng lại' });
});

export const share = asyncHandler(async (req, res) => {
  const data = await sharePostWithFriends(req.user.id, req.validated.params.id, req.validated.body);
  return sendSuccess(res, { message: `Đã gửi cho ${data.sent} người bạn`, data });
});

// ── Bình luận ──
export const listPostComments = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await listComments(req.validated.params.id, req.user?.id, req.validated.query) }),
);
export const createComment = asyncHandler(async (req, res) =>
  sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, data: await addComment(req.user.id, req.validated.params.id, req.validated.body.content) }),
);
export const deleteComment = asyncHandler(async (req, res) => {
  await removeComment(req.user.id, req.validated.params.id, req.validated.params.commentId);
  return sendSuccess(res, { message: 'Đã xoá bình luận' });
});

// PATCH /api/posts/:id — chỉnh sửa bài viết của mình
export const update = asyncHandler(async (req, res) =>
  sendSuccess(res, { message: 'Đã lưu thay đổi', data: await updatePost(req.user.id, req.validated.params.id, req.validated.body) }),
);
