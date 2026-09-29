import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from '../modules/auth/cookies.js';
import { ApiError } from '../utils/ApiError.js';
import { safeEqual } from '../utils/crypto.js';

/**
 * Double-submit check for the cookie-authenticated endpoints (refresh, logout).
 *
 * SameSite=Strict already blocks the classic cross-site POST; this is the belt to that
 * pair of braces, covering older browsers and same-site subdomain takeovers.
 *
 * A request with no refresh cookie at all is let through: it will simply fail auth next,
 * and returning a confusing CSRF error to a logged-out user helps nobody.
 */
export function requireCsrfToken(req, _res, next) {
  if (!req.cookies?.[REFRESH_COOKIE]) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return next(
      new ApiError(403, 'CSRF_TOKEN_INVALID', 'Security check failed. Refresh the page and retry.')
    );
  }

  return next();
}
