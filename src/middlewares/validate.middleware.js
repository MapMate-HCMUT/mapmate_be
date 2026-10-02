import { ERROR_CODES } from '../constants/errorCodes.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { AppError } from '../utils/AppError.js';

const REQUEST_PARTS = ['body', 'query', 'params'];

/**
 * Validate & chuẩn hóa input bằng Zod. Kết quả sạch nằm ở req.validated.{body,query,params}.
 * (Express 5: req.query là getter chỉ đọc nên không ghi đè trực tiếp.)
 */
export const validate = (schemas) => (req, _res, next) => {
  req.validated = {};
  const details = [];

  REQUEST_PARTS.forEach((part) => {
    if (!schemas[part]) return;
    const result = schemas[part].safeParse(req[part] ?? {});
    if (result.success) {
      req.validated[part] = result.data;
    } else {
      result.error.issues.forEach((issue) => details.push({ field: issue.path.join('.') || part, message: issue.message }));
    }
  });

  if (details.length > 0) {
    throw new AppError(details[0].message, HTTP_STATUS.UNPROCESSABLE_ENTITY, ERROR_CODES.VALIDATION_ERROR, details);
  }
  next();
};
