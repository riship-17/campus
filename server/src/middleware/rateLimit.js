import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { isTest } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Rate limiters share one factory so every limit responds in the standard error envelope.
 *
 * Phase 1 uses the in-process memory store, which is correct for a single instance.
 * Phase 5 swaps in `rate-limit-redis` (see README) so limits hold across replicas — until
 * then, do not run more than one API process behind the load balancer.
 */
function createLimiter({ windowMs, limit, keyGenerator, message, code, skipSuccessfulRequests }) {
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    // Tests would otherwise fail intermittently once a suite exceeds a login limit.
    skip: () => isTest,
    handler: (_req, _res, next) => next(new ApiError(429, code, message)),
  });
}

/** Blunt global ceiling so a single IP cannot flood the API. */
export const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  code: 'RATE_LIMITED',
  message: 'Too many requests. Try again in a few minutes.',
});

/**
 * Login is limited per IP *and* per email, so one attacker cannot spray many accounts
 * from one address, and a distributed attack still cannot grind a single account.
 */
export const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  // Only failures count. Someone signing in on a laptop, a phone and a lab machine inside
  // fifteen minutes is not an attack, and locking them out would be our bug, not theirs.
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase()}`,
  code: 'LOGIN_RATE_LIMITED',
  message: 'Too many sign-in attempts. Try again in 15 minutes.',
});

export const forgotPasswordLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}:${String(req.body?.email ?? '').toLowerCase()}`,
  code: 'RESET_RATE_LIMITED',
  message: 'Too many reset requests. Try again in an hour.',
});

export const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  code: 'REGISTER_RATE_LIMITED',
  message: 'Too many sign-up attempts from this network. Try again in an hour.',
});

/** Public endpoint, so it is a scraping target: keep it usable but not enumerable. */
export const verifyCertificateLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 30,
  code: 'VERIFY_RATE_LIMITED',
  message: 'Too many verification lookups. Wait a minute and try again.',
});

/** A rep scanning a queue at the door legitimately fires a lot of requests. */
export const checkInLimiter = createLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: (req) => req.user?.id ?? ipKeyGenerator(req.ip),
  code: 'CHECKIN_RATE_LIMITED',
  message: 'Scanning too quickly. Pause for a moment.',
});
