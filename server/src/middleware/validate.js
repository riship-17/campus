import { ApiError } from '../utils/ApiError.js';

/**
 * Validates and REPLACES req.body/query/params with the parsed result, so handlers only
 * ever see values the schema allowed. Schemas should be `.strict()` so unknown keys are a
 * 400 rather than something that silently rides along into a Mongoose update.
 *
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny }} schemas
 */
export const validate = (schemas) => (req, _res, next) => {
  const details = {};

  for (const source of ['body', 'query', 'params']) {
    const schema = schemas[source];
    if (!schema) continue;

    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = [source, ...issue.path].join('.');
        details[path] = issue.message;
      }
      continue;
    }

    if (source === 'query') {
      Object.defineProperty(req, 'query', {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      req[source] = result.data;
    }
  }

  if (Object.keys(details).length) {
    return next(ApiError.badRequest('Some fields need attention.', details, 'VALIDATION_ERROR'));
  }
  return next();
};
