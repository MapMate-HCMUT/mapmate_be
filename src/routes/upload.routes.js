import { Router } from 'express';
import { config, signature } from '../controllers/upload.controller.js';
import { optionalAuth, requireAuth } from '../middlewares/auth.middleware.js';
import { mediaUploadRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { uploadSignatureSchema } from '../middlewares/validators/social.validator.js';

// Ảnh / video đính kèm bài viết, đánh giá địa điểm (Cloudinary — xem services/media.service.js)
export const uploadRouter = Router();

uploadRouter.get('/config', optionalAuth, config);
uploadRouter.post('/signature', requireAuth, mediaUploadRateLimiter, validate({ body: uploadSignatureSchema }), signature);
