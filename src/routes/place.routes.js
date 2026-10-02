import { Router } from 'express';
import { getPlace, listFilterOptions, listNearbyPlaces } from '../controllers/place.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { nearbyQuerySchema } from '../middlewares/validators/place.validator.js';

export const placeRouter = Router();

placeRouter.get('/filter-options', listFilterOptions);
placeRouter.get('/nearby', optionalAuth, validate({ query: nearbyQuerySchema }), listNearbyPlaces);
placeRouter.get('/:id', optionalAuth, validate({ params: idParam() }), getPlace);
