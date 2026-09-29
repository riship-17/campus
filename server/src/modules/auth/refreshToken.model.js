import mongoose from 'mongoose';

/**
 * One document per issued refresh token.
 *
 * Tokens are stored hashed (HMAC with a server-side pepper) so a database dump cannot be
 * replayed as a session. Rotation works by revoking the used document and issuing a new one
 * in the same `family`; if a already-revoked token is ever presented again, the whole family
 * is revoked — that is the signature of a stolen token being replayed.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    replacedBy: { type: String },
    userAgent: { type: String, maxlength: 400 },
    ip: { type: String, maxlength: 64 },
  },
  { timestamps: true }
);

// Mongo reaps expired sessions on its own; no cron needed for the happy path.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, revokedAt: 1 });

refreshTokenSchema.virtual('isActive').get(function isActiveVirtual() {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
});

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
