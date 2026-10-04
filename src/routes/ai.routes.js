import { Router } from 'express';
import { chat, getAiOptions, getMySession, getMySessions, recommend, removeMySession } from '../controllers/ai.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { aiRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiChatSchema, aiRecommendSchema } from '../middlewares/validators/ai.validator.js';
import { idParam } from '../middlewares/validators/common.validator.js';

// AI Planner (Milestone 2 — mục 3.3). Khách dùng được chat (không lưu lịch sử); đăng nhập => lưu phiên.
export const aiRouter = Router();

aiRouter.get('/options', getAiOptions);
aiRouter.post('/chat', optionalAuth, aiRateLimiter, validate({ body: aiChatSchema }), chat);
aiRouter.post('/recommend', optionalAuth, aiRateLimiter, validate({ body: aiRecommendSchema }), recommend);
aiRouter.get('/sessions', requireAuth, getMySessions);
aiRouter.get('/sessions/:id', requireAuth, validate({ params: idParam() }), getMySession);
aiRouter.delete('/sessions/:id', requireAuth, validate({ params: idParam() }), removeMySession);
