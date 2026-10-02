// Lỗi nghiệp vụ có chủ đích — errorHandler sẽ trả về đúng status/errorCode cho client.
export class AppError extends Error {
  constructor(message, statusCode, errorCode, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}
