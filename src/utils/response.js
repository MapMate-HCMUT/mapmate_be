import { HTTP_STATUS } from '../constants/httpStatus.js';

// Chuẩn response thành công (backend/AGENT.md — mục 3).
export const sendSuccess = (res, { data = null, message = 'OK', statusCode = HTTP_STATUS.OK } = {}) =>
  res.status(statusCode).json({ success: true, message, data });
