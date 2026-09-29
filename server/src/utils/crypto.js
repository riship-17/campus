import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/** Cryptographically random URL-safe token. 64 bytes of entropy by default. */
export function randomToken(bytes = 64) {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Keyed hash used for anything we must be able to look up but never store in clear:
 * refresh tokens, email-verification tokens, password-reset tokens.
 * A plain SHA-256 would let a database reader brute-force short tokens; the pepper
 * lives only in the environment, so a DB dump alone is not enough.
 */
export function hashToken(token) {
  return createHmac('sha256', env.TOKEN_PEPPER).update(token).digest('hex');
}

/** Constant-time comparison for equal-length hex/ascii digests. */
export function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
