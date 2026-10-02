import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (userId) => jwt.sign({ sub: String(userId) }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);
