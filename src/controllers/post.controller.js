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
} from '../services/post.service.js';
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
  await deletePost(req.user.id, req.validated.params.id);
  return sendSuccess(res, { message: 'Đã xoá bài viết' });
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
