import { Router } from 'express';
import { claim, events, wallet } from '../controllers/voucher.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { placeSearchRateLimiter, socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { voucherClaimSchema, voucherEventsQuerySchema } from '../middlewares/validators/business.validator.js';
import { idParam } from '../middlewares/validators/common.validator.js';

// Săn voucher (services/voucher.service.js)
export const voucherRouter = Router();

voucherRouter.get('/events', optionalAuth, placeSearchRateLimiter, validate({ query: voucherEventsQuerySchema }), events);
voucherRouter.post('/events/:id/claim', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: voucherClaimSchema }), claim);
voucherRouter.get('/me', requireAuth, wallet);
