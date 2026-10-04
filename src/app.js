import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { DB_STATE } from './constants/database.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { globalRateLimiter } from './middlewares/rateLimiter.js';
import { sanitizeRequest } from './middlewares/sanitize.middleware.js';
import { apiRouter } from './routes/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JSON_BODY_LIMIT = '100kb';

const app = express();
// Chạy sau reverse proxy (Nginx, Render...) => đặt TRUST_PROXY=1 để rate limit đếm đúng IP người dùng, không phải IP của proxy
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.corsOrigins }));
app.use('/places', express.static(path.join(__dirname, '../public/places')));
// Route upload ảnh đại diện tự parse với giới hạn lớn hơn (xem user.routes.js).
const AVATAR_UPLOAD_PATH = '/api/users/me/avatar';
const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
app.use((req, res, next) => (req.path === AVATAR_UPLOAD_PATH ? next() : jsonParser(req, res, next)));
app.use(sanitizeRequest);

app.get('/api/health', (req, res) => {
  const isDbConnected = mongoose.connection.readyState === DB_STATE.CONNECTED;
  res.json({
    success: true,
    message: 'Backend is running!',
    data: { db: isDbConnected ? 'connected' : 'disconnected' },
  });
});

app.use('/api', globalRateLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
