import { verifyAccessToken } from '../modules/auth/token.service.js';
import { User } from '../modules/user/user.model.js';
import { USER_STATUS } from '../modules/user/user.constants.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

function bearerToken(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/**
 * Verifies the access token and loads the live user.
 *
 * The database round-trip is deliberate. A JWT is a snapshot; `tokenVersion` and `status`
 * are the two things that must be able to kill a session mid-flight (password change,
 * forced logout, suspension), and only the current row knows those.
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw ApiError.unauthorized('Sign in to continue.', 'NO_ACCESS_TOKEN');

  const payload = verifyAccessToken(token);

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Sign in to continue.', 'USER_NOT_FOUND');

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'This account has been suspended. Contact the SAC office.',
      'ACCOUNT_SUSPENDED'
    );
  }

  if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    throw ApiError.unauthorized('Your session ended. Sign in again.', 'SESSION_REVOKED');
  }

  req.user = user;
  req.auth = { id: user._id.toHexString(), role: user.role };
  next();
});

/**
 * Coarse role gate. It is the first of two checks, never the only one — anything scoped to
 * a club or a registration must still prove ownership in the service layer.
 * @param {...string} roles
 */
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized('Sign in to continue.', 'NO_ACCESS_TOKEN'));
    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have access to this area.', 'ROLE_FORBIDDEN'));
    }
    return next();
  };

/** Event registration and anything that sends mail requires a confirmed college address. */
export function requireVerifiedEmail(req, _res, next) {
  if (!req.user) return next(ApiError.unauthorized('Sign in to continue.', 'NO_ACCESS_TOKEN'));
  if (!req.user.isEmailVerified) {
    return next(
      ApiError.forbidden(
        'Verify your college email before you can do this. Check your inbox for the link.',
        'EMAIL_NOT_VERIFIED'
      )
    );
  }
  return next();
}

/** Attaches req.user when a valid token is present, but never rejects. For public reads. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.sub);
    if (
      user &&
      user.status === USER_STATUS.ACTIVE &&
      (payload.tokenVersion ?? 0) === (user.tokenVersion ?? 0)
    ) {
      req.user = user;
      req.auth = { id: user._id.toHexString(), role: user.role };
    }
  } catch {
    // Anonymous is a valid outcome here.
  }
  return next();
});
