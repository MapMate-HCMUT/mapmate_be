import { Router } from 'express';
import {
  acceptRequest,
  deleteRequest,
  getFriends,
  getRequests,
  getSuggestions,
  removeFriend,
  sendRequest,
} from '../controllers/friend.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { socialWriteRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { idParam } from '../middlewares/validators/common.validator.js';
import { friendRequestSchema } from '../middlewares/validators/social.validator.js';

export const friendRouter = Router();

friendRouter.use(requireAuth);
friendRouter.get('/', getFriends);
friendRouter.get('/requests', getRequests);
friendRouter.get('/suggestions', getSuggestions);
friendRouter.post('/requests', socialWriteRateLimiter, validate({ body: friendRequestSchema }), sendRequest);
friendRouter.post('/requests/:id/accept', validate({ params: idParam() }), acceptRequest);
friendRouter.delete('/requests/:id', validate({ params: idParam() }), deleteRequest);
friendRouter.delete('/:userId', validate({ params: idParam('userId') }), removeFriend);
