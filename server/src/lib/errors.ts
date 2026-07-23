/**
 * Custom error classes for the Socrates API.
 *
 * Every route handler should throw one of these (or pass to next(err))
 * and the error middleware will serialize them consistently.
 */

export class ApiError extends Error {
  status: number;
  code: string;
  detail: unknown | null;

  /**
   * @param {number} status  HTTP status code
   * @param {string} code    Machine-readable error code, e.g. "UNVERIFIED"
   * @param {string} message Human-readable description
   * @param {object} [detail] Optional extra payload
   */
  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail || null;
  }
}

export class BadRequest extends ApiError {
  constructor(message = 'Bad request', detail?: unknown) {
    super(400, 'BAD_REQUEST', message, detail);
  }
}

export class Unauthorized extends ApiError {
  constructor(message = 'Not authenticated') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class Forbidden extends ApiError {
  constructor(code = 'FORBIDDEN', message = 'Forbidden') {
    super(403, code, message);
  }
}

export class NotFound extends ApiError {
  constructor(message = 'Not found') {
    super(404, 'NOT_FOUND', message);
  }
}

export class Conflict extends ApiError {
  constructor(message = 'Conflict') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequests extends ApiError {
  constructor(message = 'Too many requests') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

export class PayloadTooLarge extends ApiError {
  constructor(message = 'Payload too large') {
    super(413, 'PAYLOAD_TOO_LARGE', message);
  }
}
