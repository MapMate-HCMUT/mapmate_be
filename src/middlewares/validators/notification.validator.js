import { z } from 'zod';
import { NOTIFICATION_DEFAULT_LIMIT, NOTIFICATION_MAX_LIMIT } from '../../constants/notifications.js';
import { objectIdSchema } from './user.validator.js';

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(NOTIFICATION_MAX_LIMIT).default(NOTIFICATION_DEFAULT_LIMIT),
  before: z.coerce.date('Cursor không hợp lệ').optional(),
});

export const notificationIdParamSchema = z.object({ id: objectIdSchema });
