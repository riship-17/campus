import mongoose from 'mongoose';

/**
 * One row per (student, club) pair. The compound unique index is what makes following
 * idempotent: a double-tap on the follow button is a duplicate-key error, not a second row.
 */
const clubFollowSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    clubId: { type: mongoose.Schema.Types.ObjectId, ref: 'Club', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

clubFollowSchema.index({ userId: 1, clubId: 1 }, { unique: true });
clubFollowSchema.index({ clubId: 1, createdAt: -1 });

export const ClubFollow = mongoose.model('ClubFollow', clubFollowSchema);
