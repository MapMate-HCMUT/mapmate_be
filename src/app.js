import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import { DB_STATE } from './constants/database.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { sanitizeRequest } from './middlewares/sanitize.middleware.js';
import { apiRouter } from './routes/index.js';

const JSON_BODY_LIMIT = '100kb';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigins }));
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

app.use('/api', apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
