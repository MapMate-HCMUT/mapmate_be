import { Router } from 'express';
import { getNotifications, getUnread, readAll, readOne } from '../controllers/notification.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { listNotificationsQuerySchema, notificationIdParamSchema } from '../middlewares/validators/notification.validator.js';

export const notificationRouter = Router();

notificationRouter.use(requireAuth);
notificationRouter.get('/', validate({ query: listNotificationsQuerySchema }), getNotifications);
notificationRouter.get('/unread-count', getUnread);
notificationRouter.patch('/read-all', readAll);
notificationRouter.patch('/:id/read', validate({ params: notificationIdParamSchema }), readOne);
