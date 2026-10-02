import { Router } from 'express';
import { listLeaderboard } from '../controllers/leaderboard.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { leaderboardQuerySchema } from '../middlewares/validators/leaderboard.validator.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', optionalAuth, validate({ query: leaderboardQuerySchema }), listLeaderboard);
