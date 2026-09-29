/**
 * Application-level error carrying an HTTP status and a stable machine-readable code.
 * Anything thrown that is not an ApiError is treated as a 500 and never leaks its message.
 */
export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} code  SCREAMING_SNAKE stable identifier for clients
   * @param {string} message  Safe to show a user
   * @param {object} [details] Field-level details (validation only)
   */
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.expected = true;
  }

  static badRequest(message, details, code = 'BAD_REQUEST') {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = 'Authentication required', code = 'UNAUTHORIZED') {
    return new ApiError(401, code, message);
  }
  static forbidden(message = 'You do not have access to this resource', code = 'FORBIDDEN') {
    return new ApiError(403, code, message);
  }
  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new ApiError(404, code, message);
  }
  static conflict(message, code = 'CONFLICT') {
    return new ApiError(409, code, message);
  }
  static tooMany(message = 'Too many requests. Try again later.', code = 'RATE_LIMITED') {
    return new ApiError(429, code, message);
  }
}
