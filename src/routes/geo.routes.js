import { Router } from 'express';
import { getDirection, getGeocode, getReverseGeocode } from '../controllers/geo.controller.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { goongRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { directionQuerySchema, geocodeQuerySchema, reverseGeocodeQuerySchema } from '../middlewares/validators/geo.validator.js';

// Tìm địa chỉ / chỉ đường qua Goong — trình duyệt không cầm key Goong (services/goong.service.js)
export const geoRouter = Router();

geoRouter.use(optionalAuth, goongRateLimiter); // đã đăng nhập => đếm theo tài khoản, khách => theo IP
geoRouter.get('/geocode', validate({ query: geocodeQuerySchema }), getGeocode);
geoRouter.get('/reverse', validate({ query: reverseGeocodeQuerySchema }), getReverseGeocode);
geoRouter.get('/direction', validate({ query: directionQuerySchema }), getDirection);
