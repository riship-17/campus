import mongoose from 'mongoose';
import { User } from '../user/user.model.js';
import { USER_STATUS } from '../user/user.constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { hashPassword, needsRehash, verifyPassword } from '../../utils/password.js';
import { checkPasswordStrength } from '../../utils/commonPasswords.js';
import { hashToken, randomToken } from '../../utils/crypto.js';
import { sendMail } from '../mail/mailer.js';
import { passwordChangedEmail, passwordResetEmail, verificationEmail } from '../mail/templates.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/auditLog.model.js';
import {
  issueRefreshToken,
  revokeAllSessions,
  revokeRefreshToken,
  signAccessToken,
} from './token.service.js';
import { logger } from '../../config/logger.js';

const EMAIL_VERIFICATION_TTL_MS = 30 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

/**
 * A fixed hash to verify against when the email is unknown, so a miss costs the same wall
 * time as a hit. Without it, response timing alone enumerates registered addresses.
 */
let decoyHash;
async function decoyVerify(password) {
  decoyHash ??= await hashPassword(`decoy:${randomToken(16)}`);
  await verifyPassword(decoyHash, password);
}

function enforcePasswordPolicy(password, identity) {
  const problem = checkPasswordStrength(password, identity);
  if (problem) {
    throw ApiError.badRequest(
      'Some fields need attention.',
      { 'body.password': problem },
      'WEAK_PASSWORD'
    );
  }
}

function newSingleUseToken(ttlMs) {
  const token = randomToken(48);
  return {
    token,
    record: {
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
      requestedAt: new Date(),
    },
  };
}

/** Email delivery must not roll back a completed signup; log and move on. */
async function sendQuietly(message, context) {
  try {
    await sendMail(message);
  } catch (err) {
    logger.error({ err, ...context }, 'Failed to send transactional email');
  }
}

/**
 * Creates an account and mails a verification link.
 *
 * Email conflicts return the same 201 body as a fresh signup, and we mail the existing owner
 * instead of creating anything — the response is identical either way, so the endpoint cannot
 * be used to discover who has an account.
 *
 * Roll-number conflicts *do* return 409. On a college domain where addresses are derived from
 * roll numbers, hiding that would be theatre, and a student who mistypes their roll number
 * needs to be told rather than silently dropped.
 */
export async function registerUser(input, req) {
  const { name, email, password, rollNumber, department, year } = input;

  enforcePasswordPolicy(password, { email, name, rollNumber });

  if (rollNumber) {
    const rollTaken = await User.exists({ rollNumber });
    if (rollTaken) {
      throw ApiError.conflict(
        'That roll number is already registered. Sign in instead, or contact the SAC office.',
        'ROLL_NUMBER_TAKEN'
      );
    }
  }

  const existing = await User.findOne({ email });
  if (existing) {
    await sendQuietly(
      {
        to: email,
        subject: 'You already have a CampusConnect account',
        text: `Hi ${existing.name},\n\nSomeone tried to create a CampusConnect account with this address, but you already have one. Sign in at ${process.env.CLIENT_URL ?? ''}/login, or use "Forgot password" if you need to reset it.`,
        html: `<p>Hi ${existing.name},</p><p>Someone tried to create a CampusConnect account with this address, but you already have one. Sign in, or use “Forgot password” if you need to reset it.</p>`,
      },
      { email }
    );
    return { emailSentTo: email };
  }

  const { token, record } = newSingleUseToken(EMAIL_VERIFICATION_TTL_MS);

  const user = await User.create({
    name,
    email,
    passwordHash: await hashPassword(password),
    rollNumber: rollNumber || undefined,
    department,
    year,
    emailVerification: record,
  });

  await sendQuietly({ to: email, ...verificationEmail({ name, token }) }, { email });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_REGISTERED,
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    },
    req
  );

  return { emailSentTo: email };
}

export async function verifyEmail(token, req) {
  const user = await User.findOne({
    'emailVerification.tokenHash': hashToken(token),
  }).select('+emailVerification');

  if (
    !user ||
    !user.emailVerification ||
    user.emailVerification.expiresAt.getTime() <= Date.now()
  ) {
    throw ApiError.badRequest(
      'That verification link has expired or was already used. Request a new one.',
      undefined,
      'INVALID_VERIFICATION_TOKEN'
    );
  }

  user.isEmailVerified = true;
  user.emailVerification = undefined; // single use
  await user.save();

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_EMAIL_VERIFIED,
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    },
    req
  );

  return user.toProfile();
}

/** Always reports success so it cannot be used to probe for registered addresses. */
export async function resendVerification(email) {
  const user = await User.findOne({ email }).select('+emailVerification');

  if (user && !user.isEmailVerified) {
    const { token, record } = newSingleUseToken(EMAIL_VERIFICATION_TTL_MS);
    user.emailVerification = record;
    await user.save();
    await sendQuietly(
      { to: user.email, ...verificationEmail({ name: user.name, token }) },
      { email }
    );
  }

  return { emailSentTo: email };
}

const INVALID_CREDENTIALS = () =>
  ApiError.unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');

/**
 * Sign-in.
 *
 * Note the lockout messaging: a locked account only *says* it is locked when the supplied
 * password is correct. An attacker guessing passwords therefore learns nothing — every wrong
 * guess looks identical whether the account exists, is locked, or neither — while the real
 * owner, who knows their password, gets told exactly why they are being turned away.
 */
export async function login({ email, password }, req) {
  const user = await User.findOne({ email }).select(
    '+passwordHash +failedLoginAttempts +lockUntil'
  );

  if (!user) {
    await decoyVerify(password);
    throw INVALID_CREDENTIALS();
  }

  const passwordMatches = await verifyPassword(user.passwordHash, password);

  if (user.isLocked) {
    if (passwordMatches) {
      const minutes = Math.max(1, Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000));
      throw new ApiError(
        423,
        'ACCOUNT_LOCKED',
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      );
    }
    throw INVALID_CREDENTIALS();
  }

  if (!passwordMatches) {
    await user.registerFailedLogin();
    await recordAudit(
      { action: AUDIT_ACTIONS.USER_LOGIN_FAILED, entityType: 'User', entityId: user._id },
      req
    );
    throw INVALID_CREDENTIALS();
  }

  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'This account has been suspended. Contact the SAC office.',
      'ACCOUNT_SUSPENDED'
    );
  }

  await user.clearLoginFailures();

  // Opportunistic upgrade if argon2 parameters were raised since this hash was written.
  if (needsRehash(user.passwordHash)) {
    user.passwordHash = await hashPassword(password);
  }
  user.lastLoginAt = new Date();
  await user.save();

  const { token: refreshToken } = await issueRefreshToken(user, req);

  await recordAudit(
    { action: AUDIT_ACTIONS.USER_LOGIN, entityType: 'User', entityId: user._id, actorId: user._id },
    req
  );

  return { user, accessToken: signAccessToken(user), refreshToken };
}

export async function logout(rawToken, req, actorId) {
  await revokeRefreshToken(rawToken);
  if (actorId) {
    await recordAudit(
      { action: AUDIT_ACTIONS.USER_LOGOUT, entityType: 'User', entityId: actorId, actorId },
      req
    );
  }
}

/** Uniform response whether or not the address exists. */
export async function forgotPassword(email, req) {
  const user = await User.findOne({ email }).select('+passwordReset');

  if (user && user.status === USER_STATUS.ACTIVE) {
    const { token, record } = newSingleUseToken(PASSWORD_RESET_TTL_MS);
    user.passwordReset = record;
    await user.save();

    await sendQuietly(
      { to: user.email, ...passwordResetEmail({ name: user.name, token }) },
      { email }
    );

    await recordAudit(
      {
        action: AUDIT_ACTIONS.USER_PASSWORD_RESET_REQUESTED,
        entityType: 'User',
        entityId: user._id,
      },
      req
    );
  }

  return { emailSentTo: email };
}

export async function resetPassword({ token, password }, req) {
  const user = await User.findOne({ 'passwordReset.tokenHash': hashToken(token) }).select(
    '+passwordReset +passwordHash'
  );

  if (!user || !user.passwordReset || user.passwordReset.expiresAt.getTime() <= Date.now()) {
    throw ApiError.badRequest(
      'That reset link has expired or was already used. Request a new one.',
      undefined,
      'INVALID_RESET_TOKEN'
    );
  }

  enforcePasswordPolicy(password, {
    email: user.email,
    name: user.name,
    rollNumber: user.rollNumber,
  });

  user.passwordHash = await hashPassword(password);
  user.passwordReset = undefined; // single use
  user.tokenVersion += 1; // kills every live access token
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  // A reset link only lands in the mailbox of the address owner, so a successful reset
  // also proves the address — no reason to make them verify twice.
  user.isEmailVerified = true;
  await user.save();

  await revokeAllSessions(user._id, 'password-reset');
  await sendQuietly(
    { to: user.email, ...passwordChangedEmail({ name: user.name }) },
    { email: user.email }
  );

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    },
    req
  );

  return user.toProfile();
}

/**
 * Changes the password for a signed-in user, ends every other session, and hands back a
 * fresh session for the device that made the change — so you are not logged out of the tab
 * you just used.
 */
export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Sign in to continue.', 'USER_NOT_FOUND');

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw ApiError.badRequest(
      'Some fields need attention.',
      { 'body.currentPassword': 'That is not your current password.' },
      'INVALID_CREDENTIALS'
    );
  }

  enforcePasswordPolicy(newPassword, {
    email: user.email,
    name: user.name,
    rollNumber: user.rollNumber,
  });

  if (await verifyPassword(user.passwordHash, newPassword)) {
    throw ApiError.badRequest(
      'Some fields need attention.',
      { 'body.newPassword': 'Choose a password you have not used here before.' },
      'PASSWORD_REUSED'
    );
  }

  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  await user.save();

  await revokeAllSessions(user._id, 'password-changed');
  await sendQuietly(
    { to: user.email, ...passwordChangedEmail({ name: user.name }) },
    { email: user.email }
  );

  await recordAudit(
    {
      action: AUDIT_ACTIONS.USER_PASSWORD_CHANGED,
      entityType: 'User',
      entityId: user._id,
      actorId: user._id,
    },
    req
  );

  const { token: refreshToken } = await issueRefreshToken(user, req);
  return { user, accessToken: signAccessToken(user), refreshToken };
}

/**
 * Explicit allowlist. `req.body` never reaches Mongoose, so no request can smuggle
 * `role`, `status`, `isEmailVerified`, or `tokenVersion` into an update.
 */
export async function updateProfile(userId, patch) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.badRequest('Invalid user id.');

  const allowed = {};
  if (patch.name !== undefined) allowed.name = patch.name;
  if (patch.department !== undefined) allowed.department = patch.department;
  if (patch.year !== undefined) allowed.year = patch.year;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: allowed },
    { new: true, runValidators: true }
  );
  if (!user) throw ApiError.notFound('User not found.');

  return user.toProfile();
}
