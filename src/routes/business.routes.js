import { Router } from 'express';
import {
  addPlace,
  changeTier,
  createPromotion,
  endPromotion,
  notifyPromotion,
  promotions,
  replyReview,
  reviews,
  updatePromotion,
  duplicates,
  featured,
  me,
  placeEvent,
  register,
  removePlace,
  stats,
  tiers,
  updateMe,
  updatePlace,
} from '../controllers/business.controller.js';
import { optionalAuth, requireAuth, requireMember } from '../middlewares/auth.middleware.js';
import { placeSearchRateLimiter, socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  businessRegisterSchema,
  businessUpdateSchema,
  duplicatesQuerySchema,
  featuredQuerySchema,
  placeCreateSchema,
  placeEventSchema,
  placeUpdateSchema,
  promotionCreateSchema,
  promotionUpdateSchema,
  reviewReplySchema,
  reviewsQuerySchema,
  statsQuerySchema,
  tierChangeSchema,
  voucherRedeemSchema,
} from '../middlewares/validators/business.validator.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { redeem } from '../controllers/voucher.controller.js';

// Tài khoản doanh nghiệp (services/business.service.js)
export const businessRouter = Router();

// Công khai
businessRouter.get('/tiers', tiers);
businessRouter.get('/featured', optionalAuth, placeSearchRateLimiter, validate({ query: featuredQuerySchema }), featured);
businessRouter.post('/places/:id/events', optionalAuth, placeSearchRateLimiter, validate({ params: idParam(), body: placeEventSchema }), placeEvent);

// Chủ doanh nghiệp
businessRouter.get('/duplicates', requireAuth, placeSearchRateLimiter, validate({ query: duplicatesQuerySchema }), duplicates);
businessRouter.post('/', requireAuth, requireMember, socialWriteRateLimiter, validate({ body: businessRegisterSchema }), register);
businessRouter.get('/me', requireAuth, me);
businessRouter.patch('/me', requireAuth, socialWriteRateLimiter, validate({ body: businessUpdateSchema }), updateMe);
businessRouter.patch('/me/tier', requireAuth, socialWriteRateLimiter, validate({ body: tierChangeSchema }), changeTier);
businessRouter.get('/me/stats', requireAuth, validate({ query: statsQuerySchema }), stats);
businessRouter.post('/me/places', requireAuth, socialWriteRateLimiter, validate({ body: placeCreateSchema }), addPlace);
businessRouter.patch('/me/places/:id', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: placeUpdateSchema }), updatePlace);
businessRouter.delete('/me/places/:id', requireAuth, socialWriteRateLimiter, validate({ params: idParam() }), removePlace);

// Khuyến mãi (quảng cáo của chủ quán)
businessRouter.get('/me/promotions', requireAuth, promotions);
businessRouter.post('/me/promotions', requireAuth, socialWriteRateLimiter, validate({ body: promotionCreateSchema }), createPromotion);
businessRouter.patch('/me/promotions/:id', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: promotionUpdateSchema }), updatePromotion);
businessRouter.delete('/me/promotions/:id', requireAuth, socialWriteRateLimiter, validate({ params: idParam() }), endPromotion);
businessRouter.post('/me/promotions/:id/notify', requireAuth, socialWriteRateLimiter, validate({ params: idParam() }), notifyPromotion);

// Đánh giá của khách
businessRouter.get('/me/reviews', requireAuth, validate({ query: reviewsQuerySchema }), reviews);
businessRouter.put('/me/reviews/:id/reply', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: reviewReplySchema }), replyReview);

// Quán xác nhận mã voucher khách đọc
businessRouter.post('/me/vouchers/redeem', requireAuth, socialWriteRateLimiter, validate({ body: voucherRedeemSchema }), redeem);
