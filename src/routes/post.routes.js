import { Router } from 'express';
import {
  create,
  createRepost,
  getOne,
  like,
  listFeed,
  listTrendingTags,
  remove,
  removeRepost,
  share,
  unlike,
} from '../controllers/post.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { createPostSchema, feedQuerySchema, repostSchema, sharePostSchema } from '../middlewares/validators/social.validator.js';

export const postRouter = Router();
const postId = validate({ params: idParam() });

postRouter.get('/', optionalAuth, validate({ query: feedQuerySchema }), listFeed);
postRouter.get('/trending-tags', listTrendingTags);
postRouter.post('/', requireAuth, socialWriteRateLimiter, validate({ body: createPostSchema }), create);
postRouter.get('/:id', optionalAuth, postId, getOne);
postRouter.delete('/:id', requireAuth, postId, remove);
postRouter.post('/:id/like', requireAuth, postId, like);
postRouter.delete('/:id/like', requireAuth, postId, unlike);
postRouter.post('/:id/repost', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: repostSchema }), createRepost);
postRouter.delete('/:id/repost', requireAuth, postId, removeRepost);
postRouter.post('/:id/share', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: sharePostSchema }), share);
