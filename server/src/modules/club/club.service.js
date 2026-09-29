import { Club } from './club.model.js';
import { ClubFollow } from './clubFollow.model.js';
import { CLUB_STATUS } from './club.constants.js';
import { User } from '../user/user.model.js';
import { ROLES } from '../user/user.constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, pageMeta, toSkip } from '../../utils/pagination.js';
import { uniqueSlug } from '../../utils/slug.js';
import { trusted } from '../../utils/db.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/auditLog.model.js';

/**
 * Loads a club and proves the caller may act on it.
 *
 * Clubs are public objects, so a rep of another club gets an honest 403 rather than a
 * misleading 404 — there is nothing to hide about a club's existence. Private objects
 * (registrations, drafts) use the opposite convention.
 */
export async function assertClubAccess(clubId, actor) {
  const club = await Club.findById(clubId);
  if (!club) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');

  if (actor.role === ROLES.ADMIN) return club;

  const isRep = club.reps.some((repId) => repId.equals(actor._id));
  if (!isRep) {
    throw ApiError.forbidden('You are not a convener of this club.', 'NOT_A_CLUB_REP');
  }

  if (club.status !== CLUB_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'This club is not active. The SAC office has to reinstate it first.',
      'CLUB_NOT_ACTIVE'
    );
  }

  return club;
}

export async function listClubs(query, viewer) {
  const { page, limit, category, q, status, followedByMe } = query;

  const filter = {};

  // Only an admin sees pending or suspended clubs; everyone else sees the active register.
  if (viewer?.role === ROLES.ADMIN) {
    if (status) filter.status = status;
  } else {
    filter.status = CLUB_STATUS.ACTIVE;
  }

  if (category) filter.category = category;
  if (q) filter.name = trusted({ $regex: escapeRegex(q), $options: 'i' });

  if (followedByMe) {
    if (!viewer) throw ApiError.unauthorized('Sign in to see the clubs you follow.');
    const follows = await ClubFollow.find({ userId: viewer._id }).select('clubId').lean();
    filter._id = trusted({ $in: follows.map((follow) => follow.clubId) });
  }

  const [clubs, total] = await Promise.all([
    Club.find(filter).sort({ name: 1 }).skip(toSkip({ page, limit })).limit(limit),
    Club.countDocuments(filter),
  ]);

  const followedIds = await followedClubIds(viewer, clubs);

  return {
    data: clubs.map((club) => ({
      ...club.toPublic(),
      isFollowing: followedIds.has(club._id.toHexString()),
    })),
    meta: pageMeta({ page, limit, total }),
  };
}

export async function getClubBySlug(slug, viewer) {
  const club = await Club.findOne({ slug });
  if (!club) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');

  const visibleToPublic = club.status === CLUB_STATUS.ACTIVE;
  const isInsider =
    viewer?.role === ROLES.ADMIN || club.reps.some((repId) => repId.equals(viewer?._id));

  if (!visibleToPublic && !isInsider) {
    throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');
  }

  const followedIds = await followedClubIds(viewer, [club]);

  const payload = {
    ...club.toPublic(),
    isFollowing: followedIds.has(club._id.toHexString()),
    canManage: Boolean(isInsider),
  };

  // Conveners are named only to people who can act on the club, not in the public listing.
  if (isInsider) {
    const reps = await User.find({ _id: trusted({ $in: club.reps }) }).select('name email role');
    payload.reps = reps.map((rep) => ({
      id: rep._id.toHexString(),
      name: rep.name,
      email: rep.email,
    }));
  }

  return payload;
}

export async function createClub(input, actor, req) {
  const { repIds = [], ...rest } = input;

  const existing = await Club.findOne({ name: rest.name });
  if (existing)
    throw ApiError.conflict('A club with that name is already registered.', 'CLUB_EXISTS');

  const club = await Club.create({
    ...rest,
    slug: await uniqueSlug(Club, rest.name),
    // Created by an admin, so it starts active — the PENDING state is for petitions.
    status: CLUB_STATUS.ACTIVE,
    reps: repIds,
  });

  if (repIds.length) await syncRepRoles(repIds, [], actor, req);

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CLUB_CREATED,
      entityType: 'Club',
      entityId: club._id,
      actorId: actor._id,
      metadata: { name: club.name },
    },
    req
  );

  return club.toPublic();
}

export async function updateClub(clubId, patch, actor, req) {
  const club = await assertClubAccess(clubId, actor);

  // Explicit allowlist: `patch` has already been through a strict Zod schema, but the
  // assignment below is what guarantees no unexpected key can reach the document.
  const allowed = [
    'name',
    'description',
    'shortDescription',
    'category',
    'logoUrl',
    'room',
    'contactEmail',
    'foundedYear',
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) club[key] = patch[key];
  }

  if (patch.name && patch.name !== club.slug) {
    club.slug = await uniqueSlug(Club, patch.name, club._id);
  }

  await club.save();

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CLUB_UPDATED,
      entityType: 'Club',
      entityId: club._id,
      actorId: actor._id,
      metadata: { fields: Object.keys(patch) },
    },
    req
  );

  return club.toPublic();
}

/** Admin-only. Replaces the convener list wholesale and reconciles the CLUB_REP role. */
export async function setClubReps(clubId, repIds, actor, req) {
  const club = await Club.findById(clubId);
  if (!club) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');

  const found = await User.find({ _id: trusted({ $in: repIds }) }).select('_id role');
  if (found.length !== repIds.length) {
    throw ApiError.badRequest(
      'One or more of those accounts does not exist.',
      undefined,
      'UNKNOWN_USER'
    );
  }

  const previous = club.reps.map((id) => id.toHexString());
  club.reps = repIds;
  await club.save();

  await syncRepRoles(repIds, previous, actor, req);

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CLUB_REPS_CHANGED,
      entityType: 'Club',
      entityId: club._id,
      actorId: actor._id,
      metadata: { from: previous, to: repIds },
    },
    req
  );

  return club.toPublic();
}

export async function setClubStatus(clubId, status, actor, req) {
  const club = await Club.findById(clubId);
  if (!club) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');

  const previous = club.status;
  club.status = status;
  await club.save();

  await recordAudit(
    {
      action: AUDIT_ACTIONS.CLUB_STATUS_CHANGED,
      entityType: 'Club',
      entityId: club._id,
      actorId: actor._id,
      metadata: { from: previous, to: status },
    },
    req
  );

  return club.toPublic();
}

/**
 * Following is idempotent by design: the unique index turns a double-tap into a duplicate
 * key, which we swallow. The counter only moves when a row was genuinely created.
 */
export async function followClub(clubId, user) {
  const club = await Club.findOne({ _id: clubId, status: CLUB_STATUS.ACTIVE });
  if (!club) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');

  try {
    await ClubFollow.create({ userId: user._id, clubId: club._id });
    await Club.updateOne({ _id: club._id }, { $inc: { followersCount: 1 } });
    club.followersCount += 1;
  } catch (err) {
    if (err?.code !== 11000) throw err;
  }

  return { clubId: club._id.toHexString(), isFollowing: true, followersCount: club.followersCount };
}

export async function unfollowClub(clubId, user) {
  const result = await ClubFollow.deleteOne({ userId: user._id, clubId });

  if (result.deletedCount) {
    // Guarded so a double-unfollow can never drive the count below zero.
    await Club.updateOne(
      { _id: clubId, followersCount: trusted({ $gt: 0 }) },
      { $inc: { followersCount: -1 } }
    );
  }

  const club = await Club.findById(clubId).select('followersCount');
  return {
    clubId: String(clubId),
    isFollowing: false,
    followersCount: club?.followersCount ?? 0,
  };
}

/** Clubs where this user is a convener — the club rep's own dashboard list. */
export async function listClubsIManage(user) {
  const clubs = await Club.find({ reps: user._id }).sort({ name: 1 });
  return clubs.map((club) => club.toPublic());
}

async function followedClubIds(viewer, clubs) {
  if (!viewer || !clubs.length) return new Set();

  const follows = await ClubFollow.find({
    userId: viewer._id,
    clubId: trusted({ $in: clubs.map((club) => club._id) }),
  })
    .select('clubId')
    .lean();

  return new Set(follows.map((follow) => follow.clubId.toHexString()));
}

/**
 * Keeps the CLUB_REP role in step with actual convenership: promote on appointment, and
 * demote when someone stops being a rep of any club at all.
 *
 * `tokenVersion` is deliberately not bumped. `authenticate` reads the role from the live
 * user row on every request, so the change takes effect on the next call without kicking
 * anyone out of a session mid-task.
 */
async function syncRepRoles(currentRepIds, previousRepIds, actor, req) {
  const current = new Set(currentRepIds.map(String));
  const previous = new Set(previousRepIds.map(String));

  const added = [...current].filter((id) => !previous.has(id));
  const removed = [...previous].filter((id) => !current.has(id));

  if (added.length) {
    await User.updateMany(
      { _id: trusted({ $in: added }), role: ROLES.STUDENT },
      { $set: { role: ROLES.CLUB_REP } }
    );
  }

  for (const userId of removed) {
    // Someone may convene more than one club; only demote when the last one is gone.
    const stillARep = await Club.exists({ reps: userId });
    if (stillARep) continue;

    await User.updateOne({ _id: userId, role: ROLES.CLUB_REP }, { $set: { role: ROLES.STUDENT } });
  }

  if (added.length || removed.length) {
    await recordAudit(
      {
        action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
        entityType: 'Club',
        actorId: actor._id,
        metadata: { promoted: added, demoted: removed },
      },
      req
    );
  }
}
