import { Event } from '../event/event.model.js';
import { EVENT_STATUS } from '../event/event.constants.js';
import { assertEventAccess, isEligible } from '../event/event.service.js';
import { Registration } from './registration.model.js';
import { REGISTRATION_STATUS } from './registration.constants.js';
import { User } from '../user/user.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, pageMeta, toSkip } from '../../utils/pagination.js';
import { inSession, trusted, withTransaction } from '../../utils/db.js';
import { recordAudit } from '../audit/audit.service.js';
import { AUDIT_ACTIONS } from '../audit/auditLog.model.js';
import { logger } from '../../config/logger.js';

/** Statuses that mean "this person currently holds something" and block a second sign-up. */
const ACTIVE_STATUSES = [
  REGISTRATION_STATUS.REGISTERED,
  REGISTRATION_STATUS.WAITLISTED,
  REGISTRATION_STATUS.ATTENDED,
  REGISTRATION_STATUS.NO_SHOW,
];

/**
 * Registers a student for an event.
 *
 * ## Why this is not a read-then-write
 *
 * The obvious implementation — read `registeredCount`, compare with `capacity`, then
 * increment — is a classic lost-update race. A hundred people tapping "Register" at 10:00:00
 * for sixty seats will all read 59 and all decide there is room.
 *
 * Instead the seat is claimed with a single atomic `findOneAndUpdate` whose filter uses
 * `$expr` to compare the two fields *inside the document*, so MongoDB evaluates the guard and
 * applies the increment under the same document lock. Exactly `capacity` claims can succeed,
 * no matter how many arrive at once — that property holds even without a transaction.
 *
 * The transaction (where the deployment provides one) adds the second guarantee: that the
 * seat claim and the registration row commit together. Where it does not, the explicit
 * compensating decrement in the catch block covers the same failure.
 */
export async function registerForEvent(eventId, user, req) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');

  assertRegistrationAllowed(event, user);

  // Cheap pre-check so the ordinary "I already signed up" case never opens a transaction.
  assertNotAlreadyHolding(await Registration.findOne({ eventId: event._id, userId: user._id }));

  const result = await withTransaction(async (session) => {
    /**
     * Re-read inside the transaction. Two simultaneous taps from the same phone both pass
     * the check above, and the second insert then collides on the unique index — which
     * MongoDB reports as a *transient* conflict and the driver dutifully retries. On the
     * retry this read sees the committed row and we can answer honestly instead of looping
     * until the transaction times out.
     */
    assertNotAlreadyHolding(
      await Registration.findOne({ eventId: event._id, userId: user._id }, null, inSession(session))
    );

    // The guard and the increment happen together, under one document lock.
    const claimed = await Event.findOneAndUpdate(
      {
        _id: event._id,
        status: EVENT_STATUS.PUBLISHED,
        $expr: trusted({ $lt: ['$registeredCount', '$capacity'] }),
      },
      { $inc: { registeredCount: 1 } },
      { new: true, ...inSession(session) }
    );

    if (claimed) {
      const registration = await attachRegistration(
        { event, user, status: REGISTRATION_STATUS.REGISTERED, session },
        // Only needed without a transaction; a rollback releases the seat on its own.
        async () => {
          await Event.updateOne(
            { _id: event._id, registeredCount: trusted({ $gt: 0 }) },
            { $inc: { registeredCount: -1 } }
          );
        }
      );

      return { registration, event: claimed, waitlisted: false };
    }

    // Full.
    if (!event.waitlistEnabled) {
      throw ApiError.conflict(
        'This one is full and there is no waitlist. Try another event from the same club.',
        'EVENT_FULL'
      );
    }

    const withWaitlist = await Event.findOneAndUpdate(
      { _id: event._id, status: EVENT_STATUS.PUBLISHED },
      { $inc: { waitlistedCount: 1 } },
      { new: true, ...inSession(session) }
    );

    if (!withWaitlist) {
      throw ApiError.conflict('Registration for this event just closed.', 'REGISTRATION_CLOSED');
    }

    const registration = await attachRegistration(
      {
        event,
        user,
        status: REGISTRATION_STATUS.WAITLISTED,
        waitlistedAt: new Date(),
        session,
      },
      async () => {
        await Event.updateOne(
          { _id: event._id, waitlistedCount: trusted({ $gt: 0 }) },
          { $inc: { waitlistedCount: -1 } }
        );
      }
    );

    return { registration, event: withWaitlist, waitlisted: true };
  });

  const position = result.waitlisted
    ? await waitlistPosition(event._id, result.registration)
    : null;

  await recordAudit(
    {
      action: AUDIT_ACTIONS.REGISTRATION_CREATED,
      entityType: 'Registration',
      entityId: result.registration._id,
      actorId: user._id,
      metadata: { eventId: event._id, status: result.registration.status },
    },
    req
  );

  return {
    registration: result.registration.toPublic(),
    waitlistPosition: position,
    seatsLeft: Math.max(0, result.event.capacity - result.event.registeredCount),
    message: result.waitlisted
      ? `This one is full, so you are number ${position} on the waitlist. We will email you the moment a seat opens.`
      : 'You are registered. Your entry pass will be on your dashboard.',
  };
}

/**
 * Cancels a registration and hands the seat to whoever has waited longest.
 *
 * The promotion happens *instead of* releasing the seat, not after it. Decrementing first
 * would open a window — however brief — in which a passer-by could take a seat that belongs
 * to the person at the top of the queue. Transferring it directly closes that window even
 * on a deployment with no transactions.
 */
export async function cancelRegistration(eventId, user, req) {
  const event = await Event.findById(eventId);
  if (!event) throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');

  if (event.startAt.getTime() <= Date.now()) {
    throw ApiError.badRequest(
      'This event has already started, so it is too late to cancel. Just do not turn up — it will be marked as a no-show.',
      undefined,
      'EVENT_ALREADY_STARTED'
    );
  }

  return withTransaction(async (session) => {
    const cancelled = await Registration.findOneAndUpdate(
      {
        eventId: event._id,
        userId: user._id,
        status: trusted({
          $in: [REGISTRATION_STATUS.REGISTERED, REGISTRATION_STATUS.WAITLISTED],
        }),
      },
      { $set: { status: REGISTRATION_STATUS.CANCELLED, cancelledAt: new Date() } },
      { new: false, ...inSession(session) }
    );

    if (!cancelled) {
      throw ApiError.notFound('You are not registered for this event.', 'NOT_REGISTERED');
    }

    if (cancelled.status === REGISTRATION_STATUS.WAITLISTED) {
      await Event.updateOne(
        { _id: event._id, waitlistedCount: trusted({ $gt: 0 }) },
        { $inc: { waitlistedCount: -1 } },
        inSession(session)
      );

      await recordAudit(
        {
          action: AUDIT_ACTIONS.REGISTRATION_CANCELLED,
          entityType: 'Registration',
          entityId: cancelled._id,
          actorId: user._id,
          metadata: { eventId: event._id, from: cancelled.status },
        },
        req
      );

      return { released: false, promoted: null, message: 'Taken off the waitlist.' };
    }

    const promoted = await promoteOneFromWaitlist(event._id, session);

    if (!promoted) {
      await Event.updateOne(
        { _id: event._id, registeredCount: trusted({ $gt: 0 }) },
        { $inc: { registeredCount: -1 } },
        inSession(session)
      );
    }

    await recordAudit(
      {
        action: AUDIT_ACTIONS.REGISTRATION_CANCELLED,
        entityType: 'Registration',
        entityId: cancelled._id,
        actorId: user._id,
        metadata: { eventId: event._id, promotedUserId: promoted?.userId },
      },
      req
    );

    return {
      released: true,
      promoted: promoted ? { registrationId: promoted._id.toHexString() } : null,
      message: promoted
        ? 'Cancelled. Your seat went to the next person on the waitlist.'
        : 'Cancelled. Your seat is back in the pool.',
    };
  });
}

/**
 * Moves the longest-waiting person into the confirmed list. The seat count does not change:
 * this is a transfer, not a new booking.
 *
 * Exported because raising an event's capacity should drain the waitlist too.
 */
export async function promoteOneFromWaitlist(eventId, session = null) {
  const promoted = await Registration.findOneAndUpdate(
    { eventId, status: REGISTRATION_STATUS.WAITLISTED },
    { $set: { status: REGISTRATION_STATUS.REGISTERED, promotedAt: new Date() } },
    // Strictly first-come: oldest waitlist entry wins.
    { sort: { createdAt: 1 }, new: true, ...inSession(session) }
  );

  if (!promoted) return null;

  await Event.updateOne(
    { _id: eventId, waitlistedCount: trusted({ $gt: 0 }) },
    { $inc: { waitlistedCount: -1 } },
    inSession(session)
  );

  await recordAudit({
    action: AUDIT_ACTIONS.REGISTRATION_PROMOTED,
    entityType: 'Registration',
    entityId: promoted._id,
    actorId: promoted.userId,
    metadata: { eventId },
  });

  return promoted;
}

/** Drains the waitlist into any seats a capacity increase just created. */
export async function fillSeatsFromWaitlist(eventId) {
  let filled = 0;

  for (;;) {
    const claimed = await Event.findOneAndUpdate(
      { _id: eventId, $expr: trusted({ $lt: ['$registeredCount', '$capacity'] }) },
      { $inc: { registeredCount: 1 } },
      { new: true }
    );
    if (!claimed) break;

    const promoted = await promoteOneFromWaitlist(eventId);
    if (!promoted) {
      // No one left waiting — give the speculatively claimed seat back.
      await Event.updateOne(
        { _id: eventId, registeredCount: trusted({ $gt: 0 }) },
        { $inc: { registeredCount: -1 } }
      );
      break;
    }

    filled += 1;
    if (filled > 1000) {
      logger.warn({ eventId }, 'Waitlist drain exceeded 1000 promotions; stopping');
      break;
    }
  }

  return filled;
}

export async function listMyRegistrations(user, query) {
  const { page, limit, status, when } = query;

  const filter = { userId: user._id };
  if (status) filter.status = status;

  const registrations = await Registration.find(filter)
    .sort({ createdAt: -1 })
    .populate({
      path: 'eventId',
      select: 'title slug startAt endAt venue status category clubId registrationDeadline',
      populate: { path: 'clubId', select: 'name slug' },
    })
    .lean();

  const now = Date.now();
  const visible = registrations
    // An event deleted out from under a registration should not crash the page.
    .filter((registration) => registration.eventId)
    .filter((registration) => {
      if (when === 'upcoming') return new Date(registration.eventId.endAt).getTime() >= now;
      if (when === 'past') return new Date(registration.eventId.endAt).getTime() < now;
      return true;
    });

  const start = toSkip({ page, limit });

  return {
    data: visible.slice(start, start + limit).map((registration) => ({
      id: registration._id.toHexString(),
      status: registration.status,
      ticketId: registration.ticketId,
      checkedInAt: registration.checkedInAt ?? null,
      createdAt: registration.createdAt,
      event: {
        id: registration.eventId._id.toHexString(),
        title: registration.eventId.title,
        slug: registration.eventId.slug,
        startAt: registration.eventId.startAt,
        endAt: registration.eventId.endAt,
        venue: registration.eventId.venue,
        category: registration.eventId.category,
        status: registration.eventId.status,
        club: registration.eventId.clubId
          ? {
              name: registration.eventId.clubId.name,
              slug: registration.eventId.clubId.slug,
            }
          : null,
      },
    })),
    meta: pageMeta({ page, limit, total: visible.length }),
  };
}

/** The club desk's attendee list. Reps only, and only for their own club's events. */
export async function listEventRegistrations(eventId, query, actor) {
  const { event } = await assertEventAccess(eventId, actor);

  const { page, limit, status, q } = query;
  const filter = { eventId: event._id };
  if (status) filter.status = status;

  if (q) {
    const pattern = trusted({ $regex: escapeRegex(q), $options: 'i' });
    const matches = await User.find({ $or: [{ name: pattern }, { rollNumber: pattern }] })
      .select('_id')
      .limit(500)
      .lean();
    filter.userId = trusted({ $in: matches.map((match) => match._id) });
  }

  const [registrations, total] = await Promise.all([
    Registration.find(filter)
      .sort({ status: 1, createdAt: 1 })
      .skip(toSkip({ page, limit }))
      .limit(limit)
      .populate('userId', 'name email rollNumber department year'),
    Registration.countDocuments(filter),
  ]);

  const counts = await countByStatus(event._id);

  return {
    data: registrations.map(toAttendeeRow),
    meta: {
      ...pageMeta({ page, limit, total }),
      counts,
      event: { id: event._id.toHexString(), title: event.title, capacity: event.capacity },
    },
  };
}

/**
 * Attendee list as CSV for the door desk.
 *
 * Every field is quoted and internal quotes are doubled, and any cell that would otherwise
 * begin with =, +, - or @ is prefixed with a single quote — otherwise a name like
 * `=cmd|' /c calc'!A1` becomes a formula the moment a convener opens the file in Excel.
 */
export async function exportEventRegistrationsCsv(eventId, actor, req) {
  const { event } = await assertEventAccess(eventId, actor);

  const registrations = await Registration.find({ eventId: event._id })
    .sort({ status: 1, createdAt: 1 })
    .populate('userId', 'name email rollNumber department year');

  const header = [
    'Ticket ID',
    'Name',
    'Roll number',
    'Email',
    'Department',
    'Year',
    'Status',
    'Registered at',
    'Checked in at',
  ];

  const rows = registrations.map((registration) => {
    const student = registration.userId ?? {};
    return [
      registration.ticketId,
      student.name ?? '',
      student.rollNumber ?? '',
      student.email ?? '',
      student.department ?? '',
      student.year ?? '',
      registration.status,
      registration.createdAt.toISOString(),
      registration.checkedInAt ? registration.checkedInAt.toISOString() : '',
    ];
  });

  await recordAudit(
    {
      action: AUDIT_ACTIONS.REGISTRATIONS_EXPORTED,
      entityType: 'Event',
      entityId: event._id,
      actorId: actor._id,
      metadata: { rows: rows.length },
    },
    req
  );

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');

  return {
    filename: `${event.slug}-registrations.csv`,
    // A BOM so Excel opens UTF-8 names correctly instead of mangling them.
    body: `\ufeff${csv}\r\n`,
  };
}

/* ------------------------------------------------------------------ helpers */

function assertNotAlreadyHolding(existing) {
  if (!existing || !ACTIVE_STATUSES.includes(existing.status)) return;

  throw ApiError.conflict(
    existing.status === REGISTRATION_STATUS.WAITLISTED
      ? 'You are already on the waitlist for this one.'
      : 'You are already registered for this one.',
    'ALREADY_REGISTERED'
  );
}

function assertRegistrationAllowed(event, user) {
  if (event.status === EVENT_STATUS.CANCELLED) {
    throw ApiError.conflict('This event was cancelled.', 'EVENT_CANCELLED');
  }

  if (event.status !== EVENT_STATUS.PUBLISHED) {
    throw ApiError.notFound('That event is not on the register.', 'EVENT_NOT_FOUND');
  }

  if (event.registrationDeadline.getTime() <= Date.now()) {
    const closed = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(event.registrationDeadline);
    throw ApiError.conflict(`Registration closed on ${closed}.`, 'REGISTRATION_CLOSED');
  }

  if (!isEligible(event, user)) {
    throw ApiError.forbidden(
      'This event is limited to specific years or departments, and yours is not on the list.',
      'NOT_ELIGIBLE'
    );
  }
}

/**
 * Creates the registration row, or revives the caller's own previously cancelled one.
 *
 * `onFailure` releases whatever seat or waitlist slot was claimed before we got here, so a
 * duplicate-key collision can never strand a phantom seat.
 */
async function attachRegistration({ event, user, status, waitlistedAt, session }, onFailure) {
  try {
    const revived = await Registration.findOneAndUpdate(
      { eventId: event._id, userId: user._id, status: REGISTRATION_STATUS.CANCELLED },
      {
        $set: { status, waitlistedAt: waitlistedAt ?? null },
        $unset: { cancelledAt: 1, promotedAt: 1 },
      },
      { new: true, ...inSession(session) }
    );
    if (revived) return revived;

    const [registration] = await Registration.create(
      [{ eventId: event._id, userId: user._id, status, waitlistedAt }],
      inSession(session)
    );
    return registration;
  } catch (err) {
    // Inside a transaction the rollback already releases the claim; compensating by hand
    // would be a write against an aborting session.
    if (!session) await onFailure();

    if (err?.code === 11000) {
      throw ApiError.conflict('You are already registered for this one.', 'ALREADY_REGISTERED');
    }
    throw err;
  }
}

/** 1-based position, counted over entries that joined the queue before this one. */
async function waitlistPosition(eventId, registration) {
  const ahead = await Registration.countDocuments({
    eventId,
    status: REGISTRATION_STATUS.WAITLISTED,
    createdAt: trusted({ $lt: registration.createdAt }),
  });
  return ahead + 1;
}

async function countByStatus(eventId) {
  const rows = await Registration.aggregate([
    { $match: { eventId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const counts = Object.fromEntries(Object.values(REGISTRATION_STATUS).map((key) => [key, 0]));
  for (const row of rows) counts[row._id] = row.count;
  return counts;
}

function toAttendeeRow(registration) {
  const student = registration.userId ?? {};
  return {
    id: registration._id.toHexString(),
    ticketId: registration.ticketId,
    status: registration.status,
    createdAt: registration.createdAt,
    checkedInAt: registration.checkedInAt ?? null,
    student: {
      id: student._id?.toHexString?.() ?? null,
      name: student.name ?? 'Deleted account',
      rollNumber: student.rollNumber ?? null,
      email: student.email ?? null,
      department: student.department ?? null,
      year: student.year ?? null,
    },
  };
}

function csvCell(value) {
  const text = String(value ?? '');
  // Neutralise spreadsheet formula injection before quoting.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
