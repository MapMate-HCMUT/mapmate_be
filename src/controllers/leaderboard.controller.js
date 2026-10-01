import { getLeaderboard } from '../services/leaderboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listLeaderboard = asyncHandler(async (req, res) => {
  const { period, limit } = req.validated.query;
  const data = await getLeaderboard({ period, limit, userId: req.user?.id });
  return sendSuccess(res, { message: 'Lấy bảng xếp hạng thành công', data });
});
