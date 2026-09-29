import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env.js';
import { hashToken, randomToken } from '../../utils/crypto.js';
import { ApiError } from '../../utils/ApiError.js';
import { RefreshToken } from './refreshToken.model.js';
import { User } from '../user/user.model.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/auditLog.model.js';
import { USER_STATUS } from '../user/user.constants.js';

const ISSUER = 'campusconnect';
const AUDIENCE = 'campusconnect-client';

/**
 * Access token carries the minimum needed to authorise a request: who, what role, and which
 * session generation. Everything else is looked up server-side, so a stale token cannot
 * assert a club membership or a verified email it no longer has.
 */
export function signAccessToken(user) {
  return jwt.sign(
    { role: user.role, tokenVersion: user.tokenVersion ?? 0 },
    env.JWT_ACCESS_SECRET,
    {
      subject: user._id.toHexString(),
      expiresIn: env.ACCESS_TOKEN_TTL,
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithm: 'HS256',
    }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    throw ApiError.unauthorized(
      expired ? 'Your session expired. Sign in again.' : 'Invalid access token.',
      expired ? 'ACCESS_TOKEN_EXPIRED' : 'INVALID_ACCESS_TOKEN'
    );
  }
}

function refreshExpiry() {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Issues a refresh token. `family` groups every token descended from one sign-in, so a
 * detected replay can revoke the entire lineage rather than just the replayed token.
 */
export async function issueRefreshToken(user, req, family = randomUUID()) {
  const token = randomToken(64);

  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(token),
    family,
    expiresAt: refreshExpiry(),
    userAgent: req?.get?.('user-agent')?.slice(0, 400),
    ip: req?.ip,
  });

  return { token, family };
}

/**
 * Validates a presented refresh token and rotates it.
 *
 * Three outcomes worth calling out:
 *  - unknown hash  → the token was never ours (or was pruned): reject.
 *  - known but already revoked → someone is replaying a token we retired. Revoke the whole
 *    family so both the attacker and the victim are forced to sign in again.
 *  - valid → revoke it, mint a successor in the same family.
 */
export async function rotateRefreshToken(rawToken, req) {
  const tokenHash = hashToken(rawToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw ApiError.unauthorized(
      'Your session is no longer valid. Sign in again.',
      'INVALID_REFRESH_TOKEN'
    );
  }

  if (existing.revokedAt || existing.expiresAt.getTime() <= Date.now()) {
    if (existing.revokedAt) {
      await revokeFamily(existing.family, 'reuse-detected');
      await recordAudit(
        {
          action: AUDIT_ACTIONS.REFRESH_TOKEN_REUSE_DETECTED,
          entityType: 'User',
          entityId: existing.userId,
          actorId: existing.userId,
          metadata: { family: existing.family },
        },
        req
      );
    }
    throw ApiError.unauthorized(
      'Your session is no longer valid. Sign in again.',
      'INVALID_REFRESH_TOKEN'
    );
  }

  const user = await User.findById(existing.userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    await revokeFamily(existing.family, 'user-inactive');
    throw ApiError.unauthorized('Your account is not active.', 'ACCOUNT_INACTIVE');
  }

  const { token: nextToken } = await issueRefreshToken(user, req, existing.family);

  existing.revokedAt = new Date();
  existing.replacedBy = hashToken(nextToken);
  await existing.save();

  return { user, refreshToken: nextToken, accessToken: signAccessToken(user) };
}

/** `revokedAt: null` matches documents where the field is null *or* absent — i.e. still live. */
const STILL_LIVE = { revokedAt: null };

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(rawToken), ...STILL_LIVE },
    { $set: { revokedAt: new Date() } }
  );
}

export async function revokeFamily(family, reason = 'revoked') {
  await RefreshToken.updateMany(
    { family, ...STILL_LIVE },
    { $set: { revokedAt: new Date(), replacedBy: reason } }
  );
}

export async function revokeAllSessions(userId, reason = 'all-sessions-revoked') {
  await RefreshToken.updateMany(
    { userId, ...STILL_LIVE },
    { $set: { revokedAt: new Date(), replacedBy: reason } }
  );
}
