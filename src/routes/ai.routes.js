import express, { Router } from 'express';
import { chat, transcribe, clearMyMemory, forgetMyFact, forgetMyNote, getAiOptions, getMyMemory, getMySession, getMySessions, recommend, removeMySession, updateMyMemory } from '../controllers/ai.controller.js';
import { requireAuth, requireMember } from '../middlewares/auth.middleware.js';
import { aiRateLimiter, voiceRateLimiter } from '../middlewares/rateLimiter.js';
import { VOICE } from '../constants/ai.js';
import { validate } from '../middlewares/validate.middleware.js';
import { aiChatSchema, aiMemoryFactParamSchema, aiMemoryUpdateSchema, aiRecommendSchema } from '../middlewares/validators/ai.validator.js';
import { idParam } from '../middlewares/validators/common.validator.js';

// AI Planner (Milestone 2 — mục 3.3). Chỉ thành viên (đăng nhập Google) — chưa đăng nhập hoặc tài khoản khách đều bị chặn.
export const aiRouter = Router();
const member = [requireAuth, requireMember];

aiRouter.get('/options', getAiOptions);
aiRouter.post('/chat', ...member, aiRateLimiter, validate({ body: aiChatSchema }), chat);
aiRouter.post('/recommend', ...member, aiRateLimiter, validate({ body: aiRecommendSchema }), recommend);
aiRouter.get('/sessions', ...member, getMySessions);
aiRouter.get('/sessions/:id', ...member, validate({ params: idParam() }), getMySession);
aiRouter.delete('/sessions/:id', ...member, validate({ params: idParam() }), removeMySession);

// Ghi nhớ sở thích: xem / bật-tắt / xoá hết / xoá từng mục
aiRouter.get('/memory', ...member, getMyMemory);
aiRouter.patch('/memory', ...member, validate({ body: aiMemoryUpdateSchema }), updateMyMemory);
aiRouter.delete('/memory', ...member, clearMyMemory);
aiRouter.delete('/memory/facts/:key', ...member, validate({ params: aiMemoryFactParamSchema }), forgetMyFact);
aiRouter.delete('/memory/notes/:id', ...member, validate({ params: idParam() }), forgetMyNote);

// Giọng nói -> chữ (Groq Whisper). Nhận file âm thanh thô, giới hạn dung lượng + tần suất.
aiRouter.post('/transcribe', ...member, voiceRateLimiter, express.raw({ type: 'audio/*', limit: VOICE.MAX_BYTES }), transcribe);
