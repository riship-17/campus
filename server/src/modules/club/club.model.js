import mongoose from 'mongoose';
import { CLUB_CATEGORIES, CLUB_STATUS, CLUB_STATUS_VALUES } from './club.constants.js';

const clubSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 90 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },

    /** Plain text, not HTML — a club blurb never needs markup. */
    description: { type: String, required: true, trim: true, maxlength: 1200 },
    shortDescription: { type: String, trim: true, maxlength: 200 },

    logoUrl: { type: String, trim: true, maxlength: 500 },
    category: { type: String, enum: CLUB_CATEGORIES, required: true, index: true },
    status: { type: String, enum: CLUB_STATUS_VALUES, default: CLUB_STATUS.PENDING, index: true },

    /**
     * The authorisation edge for the whole app: a club rep may only touch events and
     * registrations belonging to a club whose `reps` array contains their id. Every
     * ownership check queries on this field rather than trusting a clubId from the request.
     */
    reps: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true }],

    /** Denormalised for list rendering; ClubFollow remains the source of truth. */
    followersCount: { type: Number, default: 0, min: 0 },

    /** Where to find them in the real world. */
    room: { type: String, trim: true, maxlength: 120 },
    contactEmail: { type: String, trim: true, lowercase: true, maxlength: 160 },
    foundedYear: { type: Number, min: 1958, max: 2100 },
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

clubSchema.index({ status: 1, category: 1, name: 1 });
clubSchema.index({ name: 'text', description: 'text' });

clubSchema.virtual('id').get(function idVirtual() {
  return this._id.toHexString();
});

/** Public shape. Rep identities are only expanded for admins, never in the public list. */
clubSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id.toHexString(),
    name: this.name,
    slug: this.slug,
    description: this.description,
    shortDescription: this.shortDescription ?? null,
    logoUrl: this.logoUrl ?? null,
    category: this.category,
    status: this.status,
    followersCount: this.followersCount,
    room: this.room ?? null,
    contactEmail: this.contactEmail ?? null,
    foundedYear: this.foundedYear ?? null,
  };
};

export const Club = mongoose.model('Club', clubSchema);
