/**
 * Strips MongoDB operator syntax out of user-controlled input.
 *
 * express-mongo-sanitize mutates `req.query` in place, which throws on Express 5 because
 * `query` is a lazily-evaluated getter. We redefine the property instead.
 *
 * Keys beginning with `$` are operators ({ $ne: null }) and keys containing `.` can reach
 * into nested paths ({ "user.role": "ADMIN" }). Neither ever belongs in a request payload.
 */
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

function clean(value, removed) {
  if (Array.isArray(value)) return value.map((item) => clean(item, removed));
  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      removed.push(key);
      continue;
    }
    out[key] = clean(val, removed);
  }
  return out;
}

export function mongoSanitize(req, _res, next) {
  const removed = [];

  if (req.body && typeof req.body === 'object') {
    req.body = clean(req.body, removed);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = clean(req.params, removed);
  }

  const query = req.query;
  if (query && typeof query === 'object') {
    Object.defineProperty(req, 'query', {
      value: clean(query, removed),
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }

  if (removed.length && req.log) {
    req.log.warn({ removedKeys: removed }, 'Stripped MongoDB operator keys from request');
  }

  next();
}
