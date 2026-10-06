import { Router } from 'express';
import { getArrivals, getRailLines, getRoute, getRoutes, getStop, getStops, postPlan, postTripPlan, postWalkPath } from '../controllers/transit.controller.js';
import { transitRateLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.middleware.js';
import { transitPlanSchema, transitRouteParam, transitStopParam, transitStopsQuerySchema, transitTripSchema, transitWalkSchema } from '../middlewares/validators/transit.validator.js';

// Giao thông công cộng TP.HCM: xe buýt, Metro số 1, buýt đường sông (dữ liệu công khai của Trung tâm QLGT công cộng)
export const transitRouter = Router();

transitRouter.use(transitRateLimiter);
transitRouter.get('/stops', validate({ query: transitStopsQuerySchema }), getStops);
transitRouter.get('/stops/:stopId', validate({ params: transitStopParam }), getStop);
transitRouter.get('/stops/:stopId/arrivals', validate({ params: transitStopParam }), getArrivals);
transitRouter.get('/routes', getRoutes);
transitRouter.get('/routes/:routeId', validate({ params: transitRouteParam }), getRoute);
transitRouter.get('/lines', getRailLines);
transitRouter.post('/plan', validate({ body: transitPlanSchema }), postPlan);
transitRouter.post('/trip-plan', validate({ body: transitTripSchema }), postTripPlan);
transitRouter.post('/walk-path', validate({ body: transitWalkSchema }), postWalkPath);
