import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { isProd } from '../config/env.js';
import { logger } from '../config/logger.js';

export function notFoundHandler(req, _res, next) {
  next(ApiError.notFound(`No route for ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

/* eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity */
export function errorHandler(err, req, res, next) {
  const normalized = normalize(err);

  const log = req.log ?? logger;
  if (normalized.status >= 500) {
    log.error({ err, code: normalized.code }, 'Unhandled error');
  } else {
    log.warn({ code: normalized.code, msg: normalized.message }, 'Request failed');
  }

  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  };

  // Stack traces are a gift to an attacker; keep them in the logs, not the response.
  if (!isProd && normalized.status >= 500 && err instanceof Error) {
    body.error.stack = err.stack;
  }

  res.status(normalized.status).json(body);
}

function normalize(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof ZodError) {
    const details = Object.fromEntries(
      err.issues.map((issue) => [issue.path.join('.') || '(root)', issue.message])
    );
    return ApiError.badRequest('Some fields need attention.', details, 'VALIDATION_ERROR');
  }

  if (err instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(err.errors).map(([path, issue]) => [path, issue.message])
    );
    return ApiError.badRequest('Some fields need attention.', details, 'VALIDATION_ERROR');
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest('That identifier is not valid.', undefined, 'INVALID_ID');
  }

  if (err?.code === 11000) {
    const field = Object.keys(err.keyPattern ?? {})[0] ?? 'value';
    return ApiError.conflict(`That ${field} is already in use.`, 'DUPLICATE_KEY');
  }

  if (err?.type === 'entity.too.large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'That request body is too large.');
  }

  if (err?.type === 'entity.parse.failed') {
    return ApiError.badRequest('Request body is not valid JSON.', undefined, 'INVALID_JSON');
  }

  return new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
}
