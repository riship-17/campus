import jwt from 'jsonwebtoken';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { created, noContent, ok } from '../../utils/respond.js';
import { ApiError } from '../../utils/ApiError.js';
import {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  clearRefreshCookie,
  issueCsrfToken,
  setRefreshCookie,
} from './cookies.js';
import { rotateRefreshToken } from './token.service.js';
import * as authService from './auth.service.js';

/** Seconds until the access token expires — lets the client schedule a refresh. */
function expiresInSeconds(accessToken) {
  const { exp } = jwt.decode(accessToken) ?? {};
  return exp ? Math.max(0, exp - Math.floor(Date.now() / 1000)) : 0;
}

/**
 * The only place a session reaches the wire. Refresh token goes into an httpOnly cookie;
 * the access token goes in the body for the client to hold in memory. Nothing session-related
 * is ever written to localStorage.
 */
function sendSession(res, { user, accessToken, refreshToken }, status = 200) {
  setRefreshCookie(res, refreshToken);
  const csrfToken = issueCsrfToken(res);

  const payload = {
    user: user.toProfile(),
    accessToken,
    csrfToken,
    expiresIn: expiresInSeconds(accessToken),
  };

  return res.status(status).json({ data: payload });
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body, req);
  return created(res, {
    ...result,
    message: 'Check your college inbox for a confirmation link. It expires in 30 minutes.',
  });
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await authService.verifyEmail(req.body.token, req);
  return ok(res, { user, message: 'Email confirmed. You can register for events now.' });
});

export const resendVerification = asyncHandler(async (req, res) => {
  const result = await authService.resendVerification(req.body.email);
  return ok(res, {
    ...result,
    message: 'If that address needs confirming, a new link is on its way.',
  });
});

export const login = asyncHandler(async (req, res) => {
  const session = await authService.login(req.body, req);
  return sendSession(res, session);
});

export const refresh = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.[REFRESH_COOKIE];
  if (!rawToken) {
    throw ApiError.unauthorized(
      'Your session is no longer valid. Sign in again.',
      'NO_REFRESH_TOKEN'
    );
  }

  const session = await rotateRefreshToken(rawToken, req);
  return sendSession(res, session);
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], req, req.user?._id);
  clearRefreshCookie(res);
  return noContent(res);
});

export const me = asyncHandler(async (req, res) => ok(res, { user: req.user.toProfile() }));

export const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.body);
  return ok(res, { user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email, req);
  return ok(res, {
    message:
      'If that address has an account, a reset link is on its way. It expires in 15 minutes.',
  });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await authService.resetPassword(req.body, req);
  return ok(res, { user, message: 'Password updated. Sign in with your new password.' });
});

export const changePassword = asyncHandler(async (req, res) => {
  const session = await authService.changePassword(req.user._id, req.body, req);
  return sendSession(res, session);
});

/** Exposed for tests and for debugging cookie scope in development. */
export const cookieNames = { REFRESH_COOKIE, CSRF_COOKIE };
