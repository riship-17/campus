import mongoose from 'mongoose';

export const AUDIT_ACTIONS = Object.freeze({
  USER_REGISTERED: 'USER_REGISTERED',
  USER_EMAIL_VERIFIED: 'USER_EMAIL_VERIFIED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_LOCKED_OUT: 'USER_LOCKED_OUT',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_PASSWORD_RESET_REQUESTED: 'USER_PASSWORD_RESET_REQUESTED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  USER_PASSWORD_CHANGED: 'USER_PASSWORD_CHANGED',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_STATUS_CHANGED: 'USER_STATUS_CHANGED',
  REFRESH_TOKEN_REUSE_DETECTED: 'REFRESH_TOKEN_REUSE_DETECTED',

  CLUB_CREATED: 'CLUB_CREATED',
  CLUB_UPDATED: 'CLUB_UPDATED',
  CLUB_STATUS_CHANGED: 'CLUB_STATUS_CHANGED',
  CLUB_REPS_CHANGED: 'CLUB_REPS_CHANGED',

  EVENT_CREATED: 'EVENT_CREATED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  EVENT_SUBMITTED_FOR_APPROVAL: 'EVENT_SUBMITTED_FOR_APPROVAL',
  EVENT_APPROVED: 'EVENT_APPROVED',
  EVENT_PUBLISHED: 'EVENT_PUBLISHED',
  EVENT_CANCELLED: 'EVENT_CANCELLED',

  REGISTRATION_CREATED: 'REGISTRATION_CREATED',
  REGISTRATION_CANCELLED: 'REGISTRATION_CANCELLED',
  REGISTRATION_PROMOTED: 'REGISTRATION_PROMOTED',
  REGISTRATIONS_EXPORTED: 'REGISTRATIONS_EXPORTED',
});

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    action: { type: String, required: true, index: true },
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String, maxlength: 64 },
    userAgent: { type: String, maxlength: 400 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
