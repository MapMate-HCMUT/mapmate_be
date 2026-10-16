import { Router } from 'express';
import { getPublicStats } from '../services/stats.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

// Số liệu tổng cho trang giới thiệu (không cần đăng nhập)
export const statsRouter = Router();

statsRouter.get('/public', asyncHandler(async (_req, res) => sendSuccess(res, { data: await getPublicStats() })));
