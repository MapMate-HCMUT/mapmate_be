import { Router } from 'express';
import { aiRouter } from './ai.routes.js';
import { authRouter } from './auth.routes.js';
import { businessRouter } from './business.routes.js';
import { friendRouter } from './friend.routes.js';
import { geoRouter } from './geo.routes.js';
import { itineraryRouter } from './itinerary.routes.js';
import { leaderboardRouter } from './leaderboard.routes.js';
import { notificationRouter } from './notification.routes.js';
import { pinRouter } from './pin.routes.js';
import { placeRouter } from './place.routes.js';
import { postRouter } from './post.routes.js';
import { statsRouter } from './stats.routes.js';
import { transitRouter } from './transit.routes.js';
import { uploadRouter } from './upload.routes.js';
import { userRouter } from './user.routes.js';
import { voucherRouter } from './voucher.routes.js';

// Tất cả endpoint nằm dưới /api (Milestone 2 — mục 3).
export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/leaderboard', leaderboardRouter);
apiRouter.use('/notifications', notificationRouter);
apiRouter.use('/places', placeRouter);
apiRouter.use('/itineraries', itineraryRouter);
apiRouter.use('/friends', friendRouter);
apiRouter.use('/posts', postRouter);
apiRouter.use('/pins', pinRouter);
apiRouter.use('/ai', aiRouter);
apiRouter.use('/transit', transitRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/businesses', businessRouter);
apiRouter.use('/vouchers', voucherRouter);
apiRouter.use('/geo', geoRouter);
apiRouter.use('/stats', statsRouter);
