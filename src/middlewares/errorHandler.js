import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ERROR_CODES, PROFILE_ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

const DUPLICATE_KEY_ERROR = 11000;

const DUPLICATE_FIELD_ERRORS = {
  email: ['Email này đã được sử dụng', ERROR_CODES.EMAIL_TAKEN],
  username: ['Tên người dùng này đã có người dùng', ERROR_CODES.USERNAME_TAKEN],
};

// Chuyển các lỗi kỹ thuật (Mongo, JSON...) thành AppError thân thiện.
const normalizeError = (error) => {
  if (error instanceof AppError) return error;

  if (error.code === DUPLICATE_KEY_ERROR) {
    const field = Object.keys(error.keyPattern ?? {})[0];
    const [message, code] = DUPLICATE_FIELD_ERRORS[field] ?? ['Dữ liệu đã tồn tại', ERROR_CODES.DUPLICATE_RESOURCE];
    return new AppError(message, HTTP_STATUS.CONFLICT, code);
  }
  if (error instanceof mongoose.Error.CastError) {
    return new AppError('ID không hợp lệ', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_ID);
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.values(error.errors).map((item) => ({ field: item.path, message: item.message }));
    return new AppError('Dữ liệu không hợp lệ', HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR, details);
  }
  if (error.type === 'entity.too.large') {
    return new AppError('Dữ liệu gửi lên quá lớn', HTTP_STATUS.PAYLOAD_TOO_LARGE, PROFILE_ERROR_CODES.PAYLOAD_TOO_LARGE);
  }
  if (error.type === 'entity.parse.failed') {
    return new AppError('Body JSON không hợp lệ', HTTP_STATUS.BAD_REQUEST, ERROR_CODES.VALIDATION_ERROR);
  }
  return null;
};

export const notFoundHandler = (req) => {
  throw new AppError(`Không tìm thấy ${req.method} ${req.originalUrl}`, HTTP_STATUS.NOT_FOUND, ERROR_CODES.ROUTE_NOT_FOUND);
};

export const errorHandler = (error, _req, res, _next) => {
  const appError = normalizeError(error);
  if (!appError) console.error('[Unhandled error]', error);

  const statusCode = appError?.statusCode ?? HTTP_STATUS.INTERNAL_SERVER_ERROR;
  res.status(statusCode).json({
    success: false,
    message: appError?.message ?? 'Đã có lỗi xảy ra, vui lòng thử lại sau',
    errorCode: appError?.errorCode ?? ERROR_CODES.INTERNAL_ERROR,
    ...(appError?.details && { details: appError.details }),
    ...(!env.isProduction && { stack: error.stack }),
  });
};
