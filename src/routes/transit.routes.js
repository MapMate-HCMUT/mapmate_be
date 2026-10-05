import { Router } from 'express';
import {
  getNearbyTransitStops,
  getTransitRouteDetail,
  listTransitRoutes,
  matchTransitRoute,
} from '../controllers/transit.controller.js';

export const transitRouter = Router();

// Lấy danh sách các tuyến Metro & Xe buýt
transitRouter.get('/routes', listTransitRoutes);

// Gợi ý tuyến xe buýt hoặc Metro phù hợp giữa 2 tọa độ
transitRouter.get('/match', matchTransitRoute);

// Tìm trạm dừng gần tọa độ người dùng
transitRouter.get('/nearby-stops', getNearbyTransitStops);

// Lấy chi tiết lộ trình và các trạm của 1 tuyến
transitRouter.get('/routes/:id', getTransitRouteDetail);
