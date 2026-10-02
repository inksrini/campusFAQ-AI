/**
 * utils/ApiError.js — our own error class that carries an HTTP status code.
 *
 * WHY THIS EXISTS
 * Plain `throw new Error('...')` has no status code, so the central error
 * handler would have to guess (usually 500). ApiError lets any layer say
 * exactly what happened: throw new ApiError(404, 'FAQ not found').
 */
export class ApiError extends Error {
  constructor(status, message, errors = undefined) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }

  static badRequest(msg, errors) {
    return new ApiError(400, msg, errors);
  }
  static unauthorized(msg = 'Not authenticated. Please log in.') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'You do not have permission to perform this action.') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Resource not found.') {
    return new ApiError(404, msg);
  }
  static conflict(msg) {
    return new ApiError(409, msg);
  }
  static unprocessable(msg, errors) {
    return new ApiError(422, msg, errors);
  }
  static serviceUnavailable(msg) {
    return new ApiError(503, msg);
  }
}
