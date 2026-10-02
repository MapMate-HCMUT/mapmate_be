// Bọc controller async để mọi lỗi tự chuyển tới errorHandler — không cần try/catch lặp lại.
export const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
