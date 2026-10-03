import { Router } from 'express';
import { deletePin, getMyPins, putPin } from '../controllers/pin.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { pinListQuerySchema, setPinSchema } from '../middlewares/validators/social.validator.js';

export const pinRouter = Router();

pinRouter.use(requireAuth);
pinRouter.get('/', validate({ query: pinListQuerySchema }), getMyPins);
pinRouter.put('/:placeId', validate({ params: idParam('placeId'), body: setPinSchema }), putPin);
pinRouter.delete('/:placeId', validate({ params: idParam('placeId') }), deletePin);
