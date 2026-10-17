import { getFilterOptions, getPlaceById, searchPlaces } from '../services/place.service.js';
import { viewerKeyOf } from '../services/businessStats.service.js';
import { reportPlaceStatus, undoPlaceReport } from '../services/placeReport.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/response.js';

export const listFilterOptions = asyncHandler(async (_req, res) => sendSuccess(res, { data: await getFilterOptions() }));

export const listNearbyPlaces = asyncHandler(async (req, res) => {
  const data = await searchPlaces(req.validated.query, req.user?.id, { viewerKey: viewerKeyOf(req) });
  return sendSuccess(res, { message: `Tìm thấy ${data.total} địa điểm`, data });
});

export const getPlace = asyncHandler(async (req, res) => sendSuccess(res, { data: await getPlaceById(req.validated.params.id, req.user?.id) }));

const REPORT_MESSAGES = { closed: 'Cảm ơn bạn đã báo nơi này đóng cửa', open: 'Cảm ơn bạn đã xác nhận nơi này vẫn mở' };
const ISSUE_MESSAGE = 'Cảm ơn bạn đã báo lỗi — MapMate sẽ kiểm tra lại';

export const undoReport = asyncHandler(async (req, res) => sendSuccess(res, { message: 'Đã gỡ báo cáo của bạn', data: await undoPlaceReport(req.user.id, req.validated.params.id) }));

export const reportPlace = asyncHandler(async (req, res) => {
  const { type, note } = req.validated.body;
  const data = await reportPlaceStatus(req.user.id, req.validated.params.id, type, note);
  return sendSuccess(res, { message: REPORT_MESSAGES[type] ?? ISSUE_MESSAGE, data });
});
