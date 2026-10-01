import { Router } from 'express';
import { login, register } from '../controllers/auth.controller.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { loginSchema, registerSchema } from '../middlewares/validators/auth.validator.js';

export const authRouter = Router();

authRouter.post('/register', authRateLimiter, validate({ body: registerSchema }), register);
authRouter.post('/login', authRateLimiter, validate({ body: loginSchema }), login);
