import { Event } from './event.model.js';
import {
  ALLOWED_STATUS_TRANSITIONS,
  EDITABLE_STATUSES,
  EVENT_STATUS,
  PUBLIC_EVENT_STATUSES,
} from './event.constants.js';
import { Club } from '../club/club.model.js';
import { CLUB_STATUS } from '../club/club.constants.js';
import { assertClubAccess } from '../club/club.service.js';
import { Registration } from '../registration/registration.model.js';
import { REGISTRATION_STATUS } from '../registration/registration.constants.js';
import { ROLES } from '../user/user.constants.js';
import { ApiError } from '../../utils/ApiError.js';
import { pageMeta, toSkip } from '../../utils/pagination.js';
import { uniqueSlug } from '../../utils/slug.js';
import { sanitizeRichText, toPlainText } from '../../utils/sanitizeRichText.js';
import { trusted } from '../../utils/db.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/auditLog.model.js';

/**
 * Loads an event together with proof that the caller may manage it.
 *
 * The important detail is that ownership is resolved through the event's *own* clubId, not
 * through anything in the request. A rep cannot pass someone else's clubId and have it
 * believed — the only question ever asked is "does the club this event belongs to list you
 * as a convener?".
 */
export async function assertEventAccess(eventId, actor) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');

  const club = await assertClubAccess(event.clubId, actor);
  return { event, club };
}

export async function listEvents(query, viewer) {
  const {
    page,
    limit,
    q,
    category,
    club: clubSlug,
    clubId,
    from,
    to,
    when,
    hasSeats,
    openOnly,
    eligibleForMe,
    status,
    sort,
  } = query;

  const filter = {};

  if (category) filter.category = category;

  let targetClub = null;
  if (clubSlug || clubId) {
    targetClub = clubId ? await Club.findById(clubId) : await Club.findOne({ slug: clubSlug });
    if (!targetClub) throw ApiError.notFound('That club is not on the register.', 'CLUB_NOT_FOUND');
    filter.clubId = targetClub._id;
  }

  /**
   * Visibility, in one place.
   *
   * Drafts and pending submissions belong to the club that wrote them. An admin sees
   * everything; a convener sees the unpublished work of clubs they actually convene and
   * nobody else's — passing another club's id gets you their published listings and nothing
   * more. Everyone else sees the public board.
   */
  const canSeeUnpublished =
    viewer?.role === ROLES.ADMIN ||
    (viewer?.role === ROLES.CLUB_REP &&
      targetClub &&
      targetClub.reps.some((repId) => repId.equals(viewer._id)));

  if (canSeeUnpublished) {
    if (status) filter.status = status;
  } else {
    // Intersect what was asked for with what this caller may see. Asking for DRAFT as an
    // outsider yields nothing, rather than silently handing back the published list instead.
    const visible = status
      ? PUBLIC_EVENT_STATUSES.filter((candidate) => candidate === status)
      : PUBLIC_EVENT_STATUSES;
    filter.status = trusted({ $in: visible });
  }

  /**
   * A notice board shows what is coming up. Past events are still reachable — `when=past`
   * for the archive, `when=all` for a club's own register — but they do not clutter the
   * default view.
   */
  if (when === 'upcoming') filter.endAt = trusted({ $gte: new Date() });
  if (when === 'past') filter.endAt = trusted({ $lt: new Date() });

  if (from || to) {
    filter.startAt = trusted({
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: to } : {}),
    });
  }

  if (openOnly) {
    filter.status = EVENT_STATUS.PUBLISHED;
    filter.registrationDeadline = trusted({ $gt: new Date() });
  }

  // Use the text index rather than a regex: it is indexed, and it cannot be made to backtrack.
  if (q) filter.$text = trusted({ $search: q });

  if (hasSeats) {
    filter.$expr = trusted({ $lt: ['$registeredCount', '$capacity'] });
  }

  if (eligibleForMe) {
    if (!viewer) throw ApiError.unauthorized('Sign in to filter by what you can attend.');
    Object.assign(filter, eligibilityFilter(viewer));
  }

  const sortSpec = {
    soonest: { startAt: 1 },
    latest: { startAt: -1 },
    newest: { createdAt: -1 },
    seats: { registeredCount: 1, startAt: 1 },
  }[sort];

  const [events, total] = await Promise.all([
    Event.find(filter)
      .sort(sortSpec)
      .skip(toSkip({ page, limit }))
      .limit(limit)
      .populate('clubId', 'name slug category logoUrl'),
    Event.countDocuments(filter),
  ]);

  const myRegistrations = await registrationsByEvent(viewer, events);

  return {
    data: events.map((event) => ({
      ...event.toPublic(event.clubId),
      // List cards show a summary, never the full HTML body.
      description: undefined,
      summary: event.summary || toPlainText(event.description, 180),
      myRegistration: myRegistrations.get(event._id.toHexString()) ?? null,
    })),
    meta: pageMeta({ page, limit, total }),
  };
}

export async function getEventBySlug(slug, viewer) {
  const event = await Event.findOne({ slug }).populate('clubId', 'name slug category logoUrl reps');
  if (!event) throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');

  const club = event.clubId;
  const canManage =
    viewer?.role === ROLES.ADMIN ||
    Boolean(viewer && club?.reps?.some((repId) => repId.equals(viewer._id)));

  if (!PUBLIC_EVENT_STATUSES.includes(event.status) && !canManage) {
    throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');
  }

  const myRegistrations = await registrationsByEvent(viewer, [event]);

  return {
    ...event.toPublic(club),
    canManage,
    myRegistration: myRegistrations.get(event._id.toHexString()) ?? null,
    eligibility: {
      years: event.eligibility?.years ?? [],
      departments: event.eligibility?.departments ?? [],
      // Tell a student up front whether this is for them, rather than at the moment they try.
      meetsRequirements: viewer ? isEligible(event, viewer) : null,
    },
  };
}

export async function createEvent(input, actor, req) {
  const { clubId, ...rest } = input;
  const club = await assertClubAccess(clubId, actor);

  if (club.status !== CLUB_STATUS.ACTIVE) {
    throw ApiError.forbidden(
      'This club is not active, so it cannot list events.',
      'CLUB_NOT_ACTIVE'
    );
  }

  const event = await Event.create({
    ...rest,
    description: sanitizeRichText(rest.description),
    clubId: club._id,
    slug: await uniqueSlug(Event, rest.title),
    status: EVENT_STATUS.DRAFT,
    createdBy: actor._id,
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.EVENT_CREATED,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
      metadata: { clubId: club._id, title: event.title },
    },
    req
  );

  return event.toPublic(club);
}

export async function updateEvent(eventId, patch, actor, req) {
  const { event, club } = await assertEventAccess(eventId, actor);

  /**
   * Once an event is published, people have arranged their week around it. Substance is
   * frozen; only the operational fields a convener genuinely needs to correct on the day
   * stay open, and raising capacity is allowed while lowering it below what is already
   * booked is not.
   */
  const editableNow = EDITABLE_STATUSES.includes(event.status)
    ? Object.keys(patch)
    : ['venue', 'reportingTime', 'prerequisites', 'summary', 'capacity', 'bannerUrl'];

  const rejected = Object.keys(patch).filter((key) => !editableNow.includes(key));
  if (rejected.length) {
    throw ApiError.badRequest(
      `This event is already ${event.status.toLowerCase().replace('_', ' ')}, so ${rejected.join(', ')} can no longer be changed. Cancel it and post a replacement if the plan has changed.`,
      undefined,
      'EVENT_NOT_EDITABLE'
    );
  }

  if (patch.capacity !== undefined && patch.capacity < event.registeredCount) {
    throw ApiError.badRequest(
      `${event.registeredCount} people are already registered, so capacity cannot go below that.`,
      { 'body.capacity': `Minimum is ${event.registeredCount}.` },
      'CAPACITY_BELOW_REGISTERED'
    );
  }

  for (const [key, value] of Object.entries(patch)) {
    event[key] = key === 'description' ? sanitizeRichText(value) : value;
  }

  // Re-check the date rules: a PATCH may move one side of a comparison and not the other.
  assertDatesAgree(event);

  if (patch.title) event.slug = await uniqueSlug(Event, patch.title, event._id);

  await event.save();

  await recordAudit(
    {
      action: AUDIT_ACTIONS.EVENT_UPDATED,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
      metadata: { fields: Object.keys(patch) },
    },
    req
  );

  return event.toPublic(club);
}

/**
 * A convener "publishes"; what that means depends on who they are.
 *
 * A club rep's publish is a submission — it lands in PENDING_APPROVAL for the SAC office.
 * An admin's publish is the real thing. Same button, honest difference, and the response
 * says which happened so the UI can tell the truth about it.
 */
export async function publishEvent(eventId, actor, req) {
  const { event, club } = await assertEventAccess(eventId, actor);

  const target =
    actor.role === ROLES.ADMIN ? EVENT_STATUS.PUBLISHED : EVENT_STATUS.PENDING_APPROVAL;

  assertTransition(event.status, target);

  if (event.registrationDeadline.getTime() <= Date.now()) {
    throw ApiError.badRequest(
      'Registration for this event has already closed. Move the deadline before publishing.',
      { 'body.registrationDeadline': 'Pick a time in the future.' },
      'DEADLINE_PASSED'
    );
  }

  event.status = target;
  if (target === EVENT_STATUS.PUBLISHED) event.publishedAt = new Date();
  await event.save();

  await recordAudit(
    {
      action:
        target === EVENT_STATUS.PUBLISHED
          ? AUDIT_ACTIONS.EVENT_PUBLISHED
          : AUDIT_ACTIONS.EVENT_SUBMITTED_FOR_APPROVAL,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
    },
    req
  );

  return {
    ...event.toPublic(club),
    message:
      target === EVENT_STATUS.PUBLISHED
        ? 'Published. It is on the board now.'
        : 'Sent to the SAC office. You will see it go live once it is approved.',
  };
}

/** Admin decision on a submitted event: approve to publish, or send it back to draft. */
export async function approveEvent(eventId, { approved, note }, actor, req) {
  const event = await Event.findById(eventId).populate('clubId', 'name slug category logoUrl');
  if (!event) throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');

  if (event.status !== EVENT_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest(
      'That event is not waiting for approval.',
      undefined,
      'NOT_PENDING_APPROVAL'
    );
  }

  event.status = approved ? EVENT_STATUS.PUBLISHED : EVENT_STATUS.DRAFT;
  if (approved) event.publishedAt = new Date();
  await event.save();

  await recordAudit(
    {
      action: AUDIT_ACTIONS.EVENT_APPROVED,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
      metadata: { approved, note },
    },
    req
  );

  return event.toPublic(event.clubId);
}

export async function cancelEvent(eventId, reason, actor, req) {
  const { event, club } = await assertEventAccess(eventId, actor);
  assertTransition(event.status, EVENT_STATUS.CANCELLED);

  event.status = EVENT_STATUS.CANCELLED;
  event.cancelledAt = new Date();
  event.cancellationReason = reason;
  await event.save();

  /**
   * Seats are released in bulk rather than one promotion at a time: there is nothing to be
   * promoted *to*. Everyone holding a place — confirmed or waitlisted — is cancelled, and
   * Phase 5 will mail them. Their registration row survives so the history stays honest.
   */
  const released = await Registration.updateMany(
    {
      eventId: event._id,
      status: trusted({
        $in: [REGISTRATION_STATUS.REGISTERED, REGISTRATION_STATUS.WAITLISTED],
      }),
    },
    { $set: { status: REGISTRATION_STATUS.CANCELLED, cancelledAt: new Date() } }
  );

  await recordAudit(
    {
      action: AUDIT_ACTIONS.EVENT_CANCELLED,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
      metadata: { reason, releasedRegistrations: released.modifiedCount },
    },
    req
  );

  return {
    ...event.toPublic(club),
    releasedRegistrations: released.modifiedCount,
  };
}

/** The club desk's own register, including drafts. */
export async function listClubEvents(clubId, query, actor) {
  await assertClubAccess(clubId, actor);

  const { page, limit, status } = query;
  const filter = { clubId };
  if (status) filter.status = status;

  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startAt: -1 }).skip(toSkip({ page, limit })).limit(limit),
    Event.countDocuments(filter),
  ]);

  return {
    data: events.map((event) => ({ ...event.toPublic(), description: undefined })),
    meta: pageMeta({ page, limit, total }),
  };
}

/* ------------------------------------------------------------------ helpers */

/** Empty arrays mean open to all, so an unconfigured event excludes nobody. */
export function isEligible(event, user) {
  const years = event.eligibility?.years ?? [];
  const departments = event.eligibility?.departments ?? [];

  if (years.length && !years.includes(user.year)) return false;
  if (departments.length && !departments.includes(user.department)) return false;
  return true;
}

/** Mongo filter form of the same rule, for `eligibleForMe`. */
function eligibilityFilter(user) {
  return {
    $and: [
      trusted({
        $or: [{ 'eligibility.years': { $size: 0 } }, { 'eligibility.years': user.year ?? -1 }],
      }),
      trusted({
        $or: [
          { 'eligibility.departments': { $size: 0 } },
          { 'eligibility.departments': user.department ?? '—' },
        ],
      }),
    ],
  };
}

function assertTransition(from, to) {
  const allowed = ALLOWED_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw ApiError.badRequest(
      `An event that is ${from.toLowerCase().replace('_', ' ')} cannot become ${to.toLowerCase()}.`,
      undefined,
      'INVALID_STATUS_TRANSITION'
    );
  }
}

function assertDatesAgree(event) {
  const details = {};
  if (event.endAt <= event.startAt) {
    details['body.endAt'] = 'The end time has to be after the start time.';
  }
  if (event.registrationDeadline > event.startAt) {
    details['body.registrationDeadline'] =
      'Registration has to close by the time the event starts.';
  }
  if (event.reportingTime && event.reportingTime > event.startAt) {
    details['body.reportingTime'] = 'Reporting time cannot be after the start time.';
  }
  if (Object.keys(details).length) {
    throw ApiError.badRequest('Those dates do not line up.', details, 'INVALID_DATES');
  }
}

/** Map of eventId → this viewer's registration, so cards can show "You're registered". */
async function registrationsByEvent(viewer, events) {
  if (!viewer || !events.length) return new Map();

  const registrations = await Registration.find({
    userId: viewer._id,
    eventId: trusted({ $in: events.map((event) => event._id) }),
  })
    .select('eventId status ticketId')
    .lean();

  return new Map(
    registrations.map((registration) => [
      registration.eventId.toHexString(),
      { status: registration.status, ticketId: registration.ticketId },
    ])
  );
}
