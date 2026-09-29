import mongoose from 'mongoose';
import {
  DEPARTMENTS,
  LOCK_DURATION_MS,
  MAX_ACADEMIC_YEAR,
  MAX_FAILED_LOGINS,
  ROLE_VALUES,
  ROLES,
  USER_STATUS,
  USER_STATUS_VALUES,
} from './user.constants.js';

/** Hashed, single-use, expiring token attached to a user (email verification, password reset). */
const singleUseTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    requestedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    // Never selected by default: a stray `User.find()` should not carry hashes around.
    passwordHash: { type: String, required: true, select: false },

    role: { type: String, enum: ROLE_VALUES, default: ROLES.STUDENT, index: true },

    status: { type: String, enum: USER_STATUS_VALUES, default: USER_STATUS.ACTIVE, index: true },

    // Sparse: staff and admins have no roll number, and many nulls must not collide.
    rollNumber: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
      default: undefined,
    },

    department: { type: String, enum: DEPARTMENTS },
    year: { type: Number, min: 1, max: MAX_ACADEMIC_YEAR },

    isEmailVerified: { type: Boolean, default: false },
    emailVerification: { type: singleUseTokenSchema, select: false },
    passwordReset: { type: singleUseTokenSchema, select: false },

    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },

    /**
     * Bumped on password change, forced logout, or role change. Access tokens carry the
     * version they were minted with, so bumping it invalidates every live session at once
     * without a token blacklist.
     */
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        delete ret.emailVerification;
        delete ret.passwordReset;
        delete ret.failedLoginAttempts;
        delete ret.lockUntil;
        return ret;
      },
    },
  }
);

userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', email: 'text', rollNumber: 'text' });

userSchema.virtual('id').get(function idVirtual() {
  return this._id.toHexString();
});

userSchema.virtual('isLocked').get(function isLockedVirtual() {
  return Boolean(this.lockUntil && this.lockUntil.getTime() > Date.now());
});

/**
 * Records a failed sign-in and locks the account once the threshold is crossed.
 * Uses an atomic update so parallel attempts cannot both read "4" and each write "5".
 */
userSchema.methods.registerFailedLogin = async function registerFailedLogin() {
  const attempts = (this.failedLoginAttempts ?? 0) + 1;
  const update =
    attempts >= MAX_FAILED_LOGINS
      ? { $set: { failedLoginAttempts: 0, lockUntil: new Date(Date.now() + LOCK_DURATION_MS) } }
      : { $inc: { failedLoginAttempts: 1 } };

  await this.constructor.updateOne({ _id: this._id }, update);
};

userSchema.methods.clearLoginFailures = async function clearLoginFailures() {
  if (!this.failedLoginAttempts && !this.lockUntil) return;
  await this.constructor.updateOne(
    { _id: this._id },
    { $set: { failedLoginAttempts: 0 }, $unset: { lockUntil: 1 } }
  );
};

/** Public shape sent to the owning user. Never includes another user's contact details. */
userSchema.methods.toProfile = function toProfile() {
  return {
    id: this._id.toHexString(),
    name: this.name,
    email: this.email,
    role: this.role,
    status: this.status,
    rollNumber: this.rollNumber ?? null,
    department: this.department ?? null,
    year: this.year ?? null,
    isEmailVerified: this.isEmailVerified,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);
