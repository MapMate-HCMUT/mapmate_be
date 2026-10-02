import { z } from 'zod';
import {
  LEADERBOARD_DEFAULT_LIMIT,
  LEADERBOARD_MAX_LIMIT,
  LEADERBOARD_PERIODS,
} from '../../constants/gamification.js';

export const leaderboardQuerySchema = z.object({
  period: z.enum(Object.values(LEADERBOARD_PERIODS), 'period chỉ nhận week | month | all').default(LEADERBOARD_PERIODS.WEEK),
  limit: z.coerce.number().int().min(1).max(LEADERBOARD_MAX_LIMIT).default(LEADERBOARD_DEFAULT_LIMIT),
});
