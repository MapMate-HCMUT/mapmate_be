import { Router } from 'express';
import { placeSearchRateLimiter } from '../middlewares/rateLimiter.js';
import { getPlace, listFilterOptions, listNearbyPlaces, reportPlace } from '../controllers/place.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { nearbyQuerySchema, placeReportSchema } from '../middlewares/validators/place.validator.js';

export const placeRouter = Router();

placeRouter.get('/filter-options', listFilterOptions);
placeRouter.get('/nearby', optionalAuth, placeSearchRateLimiter, validate({ query: nearbyQuerySchema }), listNearbyPlaces);
placeRouter.get('/:id', optionalAuth, validate({ params: idParam() }), getPlace);
placeRouter.post('/:id/reports', requireAuth, socialWriteRateLimiter, validate({ params: idParam(), body: placeReportSchema }), reportPlace);
