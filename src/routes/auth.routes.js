import { Router } from 'express';
import { googleLogin, login, logoutAll, register } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema, registerSchema } from '../middlewares/validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
authRouter.post('/google', authRateLimiter, googleLogin);
authRouter.post('/logout-all', requireAuth, authRateLimiter, logoutAll); // thu hồi mọi phiên (máy lạ, nghi bị lộ token)
