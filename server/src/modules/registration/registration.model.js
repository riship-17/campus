import mongoose from 'mongoose';
import { customAlphabet } from 'nanoid';
import { REGISTRATION_STATUS, REGISTRATION_STATUS_VALUES } from './registration.constants.js';

/**
 * Ticket IDs are read aloud at a desk and typed into a manual-check-in box, so the alphabet
 * excludes the characters people confuse: 0/O, 1/I/L. Twelve characters of this alphabet is
 * roughly 62 bits — not guessable, and not sequential either, so the total number of
 * registrations is not inferable from a ticket.
 */
const ticketAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const generateTicketId = customAlphabet(ticketAlphabet, 12);

const registrationSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    status: {
      type: String,
      enum: REGISTRATION_STATUS_VALUES,
      default: REGISTRATION_STATUS.REGISTERED,
      index: true,
    },

    ticketId: { type: String, required: true, unique: true, default: () => generateTicketId() },

    /** Position is derived from creation order, so promotion is strictly first-come. */
    waitlistedAt: { type: Date },
    promotedAt: { type: Date },
    cancelledAt: { type: Date },

    checkedInAt: { type: Date },
    checkedInBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    checkInMethod: { type: String, enum: ['QR', 'MANUAL'] },
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

/**
 * One registration per person per event, enforced by the database rather than by a
 * check-then-insert in application code — which would race under concurrency.
 */
registrationSchema.index({ eventId: 1, userId: 1 }, { unique: true });

// Waitlist promotion reads this: oldest waitlisted entry for an event, first.
registrationSchema.index({ eventId: 1, status: 1, createdAt: 1 });
registrationSchema.index({ userId: 1, createdAt: -1 });

registrationSchema.virtual('id').get(function idVirtual() {
  return this._id.toHexString();
});

registrationSchema.methods.toPublic = function toPublic(event) {
  return {
    id: this._id.toHexString(),
    eventId: this.eventId.toHexString?.() ?? String(this.eventId),
    status: this.status,
    ticketId: this.ticketId,
    checkedInAt: this.checkedInAt ?? null,
    createdAt: this.createdAt,
    event: event ?? undefined,
  };
};

export { REGISTRATION_STATUS };
export const Registration = mongoose.model('Registration', registrationSchema);
