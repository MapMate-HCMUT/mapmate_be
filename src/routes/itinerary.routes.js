import { Router } from 'express';
import { clone, create, getOne, listMine, preview, remove, suggest, update } from '../controllers/itinerary.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { createItinerarySchema, previewItinerarySchema, suggestItinerarySchema, updateItinerarySchema } from '../middlewares/validators/itinerary.validator.js';

export const itineraryRouter = Router();

itineraryRouter.post('/suggest', optionalAuth, validate({ body: suggestItinerarySchema }), suggest);
itineraryRouter.post('/preview', validate({ body: previewItinerarySchema }), preview);
itineraryRouter.post('/', requireAuth, socialWriteRateLimiter, validate({ body: createItinerarySchema }), create);
itineraryRouter.get('/', requireAuth, listMine);
itineraryRouter.get('/:id', optionalAuth, validate({ params: idParam() }), getOne);
itineraryRouter.patch('/:id', requireAuth, validate({ params: idParam(), body: updateItinerarySchema }), update);
itineraryRouter.delete('/:id', requireAuth, validate({ params: idParam() }), remove);
itineraryRouter.post('/:id/clone', requireAuth, socialWriteRateLimiter, validate({ params: idParam() }), clone);
