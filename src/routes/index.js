import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { friendRouter } from './friend.routes.js';
import { itineraryRouter } from './itinerary.routes.js';
import { leaderboardRouter } from './leaderboard.routes.js';
import { notificationRouter } from './notification.routes.js';
import { pinRouter } from './pin.routes.js';
import { placeRouter } from './place.routes.js';
import { postRouter } from './post.routes.js';
import { userRouter } from './user.routes.js';

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
