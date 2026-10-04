import express, { Router } from 'express';
import { chat, transcribe, clearMyMemory, forgetMyFact, forgetMyNote, getAiOptions, getMyMemory, getMySession, getMySessions, recommend, removeMySession, updateMyMemory } from '../controllers/ai.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { aiRateLimiter, voiceRateLimiter } from '../middlewares/rateLimiter.js';
import { VOICE } from '../constants/ai.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiChatSchema, aiMemoryFactParamSchema, aiMemoryUpdateSchema, aiRecommendSchema } from '../middlewares/validators/ai.validator.js';
import { idParam } from '../middlewares/validators/common.validator.js';

// AI Planner (Milestone 2 — mục 3.3). Khách dùng được chat (không lưu lịch sử); đăng nhập => lưu phiên.
export const aiRouter = Router();

aiRouter.get('/options', getAiOptions);
aiRouter.post('/chat', optionalAuth, aiRateLimiter, validate({ body: aiChatSchema }), chat);
aiRouter.post('/recommend', optionalAuth, aiRateLimiter, validate({ body: aiRecommendSchema }), recommend);
aiRouter.get('/sessions', requireAuth, getMySessions);
aiRouter.get('/sessions/:id', requireAuth, validate({ params: idParam() }), getMySession);
aiRouter.delete('/sessions/:id', requireAuth, validate({ params: idParam() }), removeMySession);

// Ghi nhớ sở thích: xem / bật-tắt / xoá hết / xoá từng mục
aiRouter.get('/memory', requireAuth, getMyMemory);
aiRouter.patch('/memory', requireAuth, validate({ body: aiMemoryUpdateSchema }), updateMyMemory);
aiRouter.delete('/memory', requireAuth, clearMyMemory);
aiRouter.delete('/memory/facts/:key', requireAuth, validate({ params: aiMemoryFactParamSchema }), forgetMyFact);
aiRouter.delete('/memory/notes/:id', requireAuth, validate({ params: idParam() }), forgetMyNote);

// Giọng nói -> chữ (Groq Whisper). Nhận file âm thanh thô, giới hạn dung lượng + tần suất.
aiRouter.post('/transcribe', optionalAuth, voiceRateLimiter, express.raw({ type: 'audio/*', limit: VOICE.MAX_BYTES }), transcribe);
