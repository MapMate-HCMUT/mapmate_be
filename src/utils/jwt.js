import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

// ver = phiên bản phiên của tài khoản lúc cấp token (services/session.service.js) — token cũ hơn bị từ chối
export const signAccessToken = (userId, version = 0) => jwt.sign({ sub: String(userId), ver: version }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);
