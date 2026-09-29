import { env, isProd } from '../../config/env.js';
import { randomToken } from '../../utils/crypto.js';

export const REFRESH_COOKIE = 'cc_refresh';
export const CSRF_COOKIE = 'cc_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * The refresh cookie is scoped to the auth routes only, so it is never attached to ordinary
 * API calls — an XSS-adjacent bug on a data endpoint cannot ride it, and CSRF surface is
 * limited to three endpoints that all require the double-submit header.
 */
const refreshCookiePath = `${env.API_PREFIX}/auth`;

function baseOptions() {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN || undefined,
    path: refreshCookiePath,
  };
}

export function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, baseOptions());
  res.clearCookie(CSRF_COOKIE, { ...baseOptions(), httpOnly: false, path: '/' });
}

/**
 * Double-submit CSRF: the value is readable by our own JS (httpOnly: false) and must be
 * echoed back in a header. A cross-site form post carries the cookie but cannot read it,
 * so it cannot produce the matching header.
 */
export function issueCsrfToken(res) {
  const token = randomToken(32);
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: isProd,
    sameSite: 'strict',
    domain: env.COOKIE_DOMAIN || undefined,
    path: '/',
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
  return token;
}
