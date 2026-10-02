import express, { Router } from 'express';
import { AVATAR_BODY_LIMIT } from '../constants/auth.js';
import {
  changePassword,
  checkUsername,
  deleteAvatar,
  getAvatar,
  getMe,
  getMyHistory,
  getUserById,
  reverseGeocode,
  updateMe,
  uploadAvatar,
} from '../controllers/user.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { authRateLimiter, geocodeRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  avatarUploadSchema,
  changePasswordSchema,
  checkUsernameQuerySchema,
  reverseGeocodeQuerySchema,
  updateProfileSchema,
  userIdParamSchema,
  xpHistoryQuerySchema,
} from '../middlewares/validators/user.validator.js';

export const userRouter = Router();

// Các route cố định phải khai báo trước /:id
userRouter.get('/check-username', optionalAuth, validate({ query: checkUsernameQuerySchema }), checkUsername);
userRouter.get('/me', requireAuth, getMe);
userRouter.patch('/me', requireAuth, validate({ body: updateProfileSchema }), updateMe);
userRouter.patch('/me/password', requireAuth, authRateLimiter, validate({ body: changePasswordSchema }), changePassword);
userRouter.get('/me/xp-history', requireAuth, validate({ query: xpHistoryQuerySchema }), getMyHistory);
userRouter.get('/me/area-from-location', requireAuth, geocodeRateLimiter, validate({ query: reverseGeocodeQuerySchema }), reverseGeocode);
userRouter.put(
  '/me/avatar',
  requireAuth,
  express.json({ limit: AVATAR_BODY_LIMIT }), // body lớn hơn mức chung 100kb, chỉ cho riêng route này
  validate({ body: avatarUploadSchema }),
  uploadAvatar,
);
userRouter.delete('/me/avatar', requireAuth, deleteAvatar);
userRouter.get('/:id/avatar', validate({ params: userIdParamSchema }), getAvatar);
userRouter.get('/:id', validate({ params: userIdParamSchema }), getUserById);
