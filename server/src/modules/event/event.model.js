import mongoose from 'mongoose';
import {
  EVENT_CATEGORIES,
  EVENT_STATUS,
  EVENT_STATUS_VALUES,
  MAX_EVENT_CAPACITY,
} from './event.constants.js';
import { DEPARTMENTS, MAX_ACADEMIC_YEAR } from '../user/user.constants.js';

/** Empty arrays mean "open to everyone" — the common case should need no configuration. */
const eligibilitySchema = new mongoose.Schema(
  {
    years: [{ type: Number, min: 1, max: MAX_ACADEMIC_YEAR }],
    departments: [{ type: String, enum: DEPARTMENTS }],
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true, index: true },

    title: { type: String, required: true, trim: true, minlength: 4, maxlength: 160 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },

    /** Sanitised server-side on every write; see utils/sanitizeRichText.js. */
    description: { type: String, required: true, maxlength: 20_000 },
    summary: { type: String, trim: true, maxlength: 280 },

    bannerUrl: { type: String, trim: true, maxlength: 500 },
    category: { type: String, enum: EVENT_CATEGORIES, required: true, index: true },
    venue: { type: String, required: true, trim: true, maxlength: 200 },

    startAt: { type: Date, required: true, index: true },
    endAt: { type: Date, required: true },
    registrationDeadline: { type: Date, required: true },

    capacity: { type: Number, required: true, min: 1, max: MAX_EVENT_CAPACITY },

    /**
     * Counts confirmed seats only. Never written from a request body — it moves solely
     * through guarded `$inc` operations in the registration service, which is what keeps
     * a hundred simultaneous sign-ups from overbooking sixty seats.
     */
    registeredCount: { type: Number, default: 0, min: 0 },
    waitlistedCount: { type: Number, default: 0, min: 0 },

    waitlistEnabled: { type: Boolean, default: true },
    eligibility: { type: eligibilitySchema, default: () => ({ years: [], departments: [] }) },

    status: { type: String, enum: EVENT_STATUS_VALUES, default: EVENT_STATUS.DRAFT, index: true },

    requireFeedbackForCertificate: { type: Boolean, default: true },
    certificateTemplateId: { type: String, trim: true, maxlength: 60 },

    /** Practical notes shown on the detail page: what to bring, where to report. */
    prerequisites: { type: String, trim: true, maxlength: 600 },
    reportingTime: { type: Date },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    publishedAt: { type: Date },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, trim: true, maxlength: 400 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// The two listings that matter: the public "what's on" feed and a club's own register.
eventSchema.index({ status: 1, startAt: 1 });
eventSchema.index({ clubId: 1, startAt: -1 });
eventSchema.index({ title: 'text', description: 'text', venue: 'text' });

eventSchema.virtual('id').get(function idVirtual() {
  return this._id.toHexString();
});

eventSchema.virtual('seatsLeft').get(function seatsLeftVirtual() {
  return Math.max(0, this.capacity - this.registeredCount);
});

eventSchema.virtual('isFull').get(function isFullVirtual() {
  return this.registeredCount >= this.capacity;
});

eventSchema.virtual('registrationOpen').get(function registrationOpenVirtual() {
  return this.status === EVENT_STATUS.PUBLISHED && this.registrationDeadline.getTime() > Date.now();
});

/**
 * Shape sent to students. Deliberately omits `createdBy` and anything operational —
 * a listing should not leak who inside a club drafted what.
 */
eventSchema.methods.toPublic = function toPublic(club) {
  return {
    id: this._id.toHexString(),
    title: this.title,
    slug: this.slug,
    description: this.description,
    summary: this.summary ?? null,
    bannerUrl: this.bannerUrl ?? null,
    category: this.category,
    venue: this.venue,
    startAt: this.startAt,
    endAt: this.endAt,
    registrationDeadline: this.registrationDeadline,
    reportingTime: this.reportingTime ?? null,
    prerequisites: this.prerequisites ?? null,
    capacity: this.capacity,
    registeredCount: this.registeredCount,
    waitlistedCount: this.waitlistedCount,
    seatsLeft: this.seatsLeft,
    isFull: this.isFull,
    waitlistEnabled: this.waitlistEnabled,
    registrationOpen: this.registrationOpen,
    eligibility: {
      years: this.eligibility?.years ?? [],
      departments: this.eligibility?.departments ?? [],
    },
    status: this.status,
    requireFeedbackForCertificate: this.requireFeedbackForCertificate,
    cancellationReason: this.cancellationReason ?? null,
    club: club
      ? {
          id: club._id?.toHexString?.() ?? String(club.id ?? club._id),
          name: club.name,
          slug: club.slug,
          category: club.category,
          logoUrl: club.logoUrl ?? null,
        }
      : undefined,
  };
};

export const Event = mongoose.model('Event', eventSchema);
