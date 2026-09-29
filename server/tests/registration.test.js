import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DAY, makeClub, makeEvent, makeUser, startTestServer, tokenFor } from './helpers.js';
import { Event } from '../src/modules/event/event.model.js';
import { Registration } from '../src/modules/registration/registration.model.js';
import { REGISTRATION_STATUS } from '../src/modules/registration/registration.constants.js';
import { EVENT_STATUS } from '../src/modules/event/event.constants.js';

let ctx;

beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(async () => {
  await ctx.stop();
});
beforeEach(async () => {
  await ctx.reset();
});

const registerFor = (eventId, token) =>
  request(ctx.app)
    .post(ctx.api(`/events/${eventId}/register`))
    .set('Authorization', `Bearer ${token}`);

const cancelFor = (eventId, token) =>
  request(ctx.app)
    .delete(ctx.api(`/events/${eventId}/register`))
    .set('Authorization', `Bearer ${token}`);

describe('capacity under concurrency', () => {
  /**
   * The scenario the whole design exists for: a registration link goes out, and everyone
   * taps it in the same second. A read-then-write implementation passes a sequential test
   * and fails this one.
   */
  it('gives exactly 60 seats to 100 simultaneous registrations, with the rest waitlisted', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 60, waitlistEnabled: true });

    const students = await Promise.all(Array.from({ length: 100 }, () => makeUser()));
    const tokens = await Promise.all(students.map((student) => tokenFor(ctx.app, student)));

    const responses = await Promise.all(
      tokens.map((token) => registerFor(event._id.toHexString(), token))
    );

    const created = responses.filter((response) => response.status === 201);

    // If any request failed, say which and why — a bare length mismatch on a concurrency
    // test is the least debuggable failure there is.
    const failures = responses
      .filter((response) => response.status !== 201)
      .map(
        (response) =>
          `${response.status} ct=${response.headers?.['content-type'] ?? '-'} text=${String(response.text ?? '(none)').slice(0, 200)}`
      );
    expect(failures, `every request should succeed, but: ${failures.join(' | ')}`).toEqual([]);
    expect(created).toHaveLength(100);

    const confirmed = created.filter(
      (response) => response.body.data.registration.status === REGISTRATION_STATUS.REGISTERED
    );
    const waitlisted = created.filter(
      (response) => response.body.data.registration.status === REGISTRATION_STATUS.WAITLISTED
    );

    expect(confirmed).toHaveLength(60);
    expect(waitlisted).toHaveLength(40);

    // The denormalised counters must agree with the rows, or every later screen lies.
    const [stored, registeredRows, waitlistedRows] = await Promise.all([
      Event.findById(event._id),
      Registration.countDocuments({ eventId: event._id, status: REGISTRATION_STATUS.REGISTERED }),
      Registration.countDocuments({ eventId: event._id, status: REGISTRATION_STATUS.WAITLISTED }),
    ]);

    expect(stored.registeredCount).toBe(60);
    expect(stored.waitlistedCount).toBe(40);
    expect(registeredRows).toBe(60);
    expect(waitlistedRows).toBe(40);
    expect(stored.registeredCount).toBeLessThanOrEqual(stored.capacity);
  });

  it('turns everyone away once the waitlist is off and the room is full', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 5, waitlistEnabled: false });

    const students = await Promise.all(Array.from({ length: 20 }, () => makeUser()));
    const tokens = await Promise.all(students.map((student) => tokenFor(ctx.app, student)));

    const responses = await Promise.all(
      tokens.map((token) => registerFor(event._id.toHexString(), token))
    );

    expect(responses.filter((response) => response.status === 201)).toHaveLength(5);

    const rejected = responses.filter((response) => response.status === 409);
    expect(rejected).toHaveLength(15);
    expect(rejected[0].body.error.code).toBe('EVENT_FULL');

    const stored = await Event.findById(event._id);
    expect(stored.registeredCount).toBe(5);
  });

  it('does not let one person take two seats by double-tapping', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 10 });
    const student = await makeUser();
    const token = await tokenFor(ctx.app, student);

    const responses = await Promise.all([
      registerFor(event._id.toHexString(), token),
      registerFor(event._id.toHexString(), token),
      registerFor(event._id.toHexString(), token),
    ]);

    expect(responses.filter((response) => response.status === 201)).toHaveLength(1);

    const stored = await Event.findById(event._id);
    expect(stored.registeredCount).toBe(1);
    expect(await Registration.countDocuments({ eventId: event._id })).toBe(1);
  });
});

describe('waitlist promotion', () => {
  it('hands a cancelled seat to whoever has waited longest', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 1, waitlistEnabled: true });

    const holder = await makeUser({ name: 'Seat Holder' });
    const first = await makeUser({ name: 'First In Queue' });
    const second = await makeUser({ name: 'Second In Queue' });

    const holderToken = await tokenFor(ctx.app, holder);
    const firstToken = await tokenFor(ctx.app, first);
    const secondToken = await tokenFor(ctx.app, second);

    await registerFor(event._id.toHexString(), holderToken).expect(201);

    const firstWait = await registerFor(event._id.toHexString(), firstToken).expect(201);
    expect(firstWait.body.data.registration.status).toBe(REGISTRATION_STATUS.WAITLISTED);
    expect(firstWait.body.data.waitlistPosition).toBe(1);

    const secondWait = await registerFor(event._id.toHexString(), secondToken).expect(201);
    expect(secondWait.body.data.waitlistPosition).toBe(2);

    const cancelled = await cancelFor(event._id.toHexString(), holderToken).expect(200);
    expect(cancelled.body.data.promoted).not.toBeNull();

    const [promoted, stillWaiting, stored] = await Promise.all([
      Registration.findOne({ eventId: event._id, userId: first._id }),
      Registration.findOne({ eventId: event._id, userId: second._id }),
      Event.findById(event._id),
    ]);

    expect(promoted.status).toBe(REGISTRATION_STATUS.REGISTERED);
    expect(promoted.promotedAt).toBeTruthy();
    expect(stillWaiting.status).toBe(REGISTRATION_STATUS.WAITLISTED);

    // A transfer, not a new booking: the seat count never moved.
    expect(stored.registeredCount).toBe(1);
    expect(stored.waitlistedCount).toBe(1);
  });

  it('just releases the seat when nobody is waiting', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 5 });
    const student = await makeUser();
    const token = await tokenFor(ctx.app, student);

    await registerFor(event._id.toHexString(), token).expect(201);
    const cancelled = await cancelFor(event._id.toHexString(), token).expect(200);

    expect(cancelled.body.data.promoted).toBeNull();
    expect((await Event.findById(event._id)).registeredCount).toBe(0);
  });

  it('lets someone register again after cancelling, without leaving a stale row', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 5 });
    const student = await makeUser();
    const token = await tokenFor(ctx.app, student);

    await registerFor(event._id.toHexString(), token).expect(201);
    await cancelFor(event._id.toHexString(), token).expect(200);
    await registerFor(event._id.toHexString(), token).expect(201);

    expect(await Registration.countDocuments({ eventId: event._id })).toBe(1);
    expect((await Event.findById(event._id)).registeredCount).toBe(1);
  });

  it('drains the waitlist when capacity goes up', async () => {
    const rep = await makeUser({ role: 'CLUB_REP' });
    const club = await makeClub({ reps: [rep._id] });
    const event = await makeEvent(club, { capacity: 1, waitlistEnabled: true, createdBy: rep._id });

    const holder = await makeUser();
    const waiting = await Promise.all([makeUser(), makeUser()]);

    await registerFor(event._id.toHexString(), await tokenFor(ctx.app, holder)).expect(201);
    for (const student of waiting) {
      await registerFor(event._id.toHexString(), await tokenFor(ctx.app, student)).expect(201);
    }

    const repToken = await tokenFor(ctx.app, rep);
    const raised = await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set('Authorization', `Bearer ${repToken}`)
      .send({ capacity: 3 })
      .expect(200);

    expect(raised.body.data.promotedFromWaitlist).toBe(2);

    const stored = await Event.findById(event._id);
    expect(stored.registeredCount).toBe(3);
    expect(stored.waitlistedCount).toBe(0);
  });
});

describe('registration rules', () => {
  it('refuses once the deadline has passed', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, {
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      registrationDeadline: new Date(Date.now() - 60 * 1000),
    });
    const token = await tokenFor(ctx.app, await makeUser());

    const res = await registerFor(event._id.toHexString(), token).expect(409);
    expect(res.body.error.code).toBe('REGISTRATION_CLOSED');
    expect(res.body.error.message).toMatch(/Registration closed on/);
  });

  it('enforces year and department eligibility server-side', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, {
      eligibility: { years: [1, 2], departments: ['Mechanical Engineering'] },
    });

    const ineligible = await makeUser({ year: 4, department: 'Computer Science & Engineering' });
    const eligible = await makeUser({ year: 2, department: 'Mechanical Engineering' });

    const refused = await registerFor(
      event._id.toHexString(),
      await tokenFor(ctx.app, ineligible)
    ).expect(403);
    expect(refused.body.error.code).toBe('NOT_ELIGIBLE');

    await registerFor(event._id.toHexString(), await tokenFor(ctx.app, eligible)).expect(201);
  });

  it('requires a confirmed college email', async () => {
    const club = await makeClub();
    const event = await makeEvent(club);
    const unverified = await makeUser({ isEmailVerified: false });

    const res = await registerFor(
      event._id.toHexString(),
      await tokenFor(ctx.app, unverified)
    ).expect(403);

    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('hides unpublished events from students entirely', async () => {
    const club = await makeClub();
    const draft = await makeEvent(club, { status: EVENT_STATUS.DRAFT });
    const token = await tokenFor(ctx.app, await makeUser());

    const res = await registerFor(draft._id.toHexString(), token).expect(404);
    expect(res.body.error.code).toBe('EVENT_NOT_FOUND');
  });

  it('says so plainly when an event was cancelled', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { status: EVENT_STATUS.CANCELLED });
    const token = await tokenFor(ctx.app, await makeUser());

    const res = await registerFor(event._id.toHexString(), token).expect(409);
    expect(res.body.error.code).toBe('EVENT_CANCELLED');
  });

  it('will not cancel after the event has started', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, {
      startAt: new Date(Date.now() + 60 * 1000),
      registrationDeadline: new Date(Date.now() + 30 * 1000),
    });
    const token = await tokenFor(ctx.app, await makeUser());

    await registerFor(event._id.toHexString(), token).expect(201);

    await Event.updateOne({ _id: event._id }, { $set: { startAt: new Date(Date.now() - 1000) } });

    const res = await cancelFor(event._id.toHexString(), token).expect(400);
    expect(res.body.error.code).toBe('EVENT_ALREADY_STARTED');
  });
});

describe('GET /me/registrations', () => {
  it('returns only the caller’s own registrations', async () => {
    const club = await makeClub();
    const event = await makeEvent(club, { capacity: 10 });

    const mine = await makeUser();
    const theirs = await makeUser();
    const myToken = await tokenFor(ctx.app, mine);

    await registerFor(event._id.toHexString(), myToken).expect(201);
    await registerFor(event._id.toHexString(), await tokenFor(ctx.app, theirs)).expect(201);

    const res = await request(ctx.app)
      .get(ctx.api('/me/registrations'))
      .set('Authorization', `Bearer ${myToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].event.title).toBe(event.title);
    expect(res.body.data[0].ticketId).toMatch(/^[2-9A-HJ-NP-Z]{12}$/);
  });

  it('splits upcoming from past by the event end time', async () => {
    const club = await makeClub();
    const past = await makeEvent(club, {
      startAt: new Date(Date.now() - 3 * DAY),
      registrationDeadline: new Date(Date.now() - 4 * DAY),
      status: EVENT_STATUS.COMPLETED,
    });
    const upcoming = await makeEvent(club);

    const student = await makeUser();
    const token = await tokenFor(ctx.app, student);

    await Registration.create({
      eventId: past._id,
      userId: student._id,
      status: REGISTRATION_STATUS.ATTENDED,
    });
    await registerFor(upcoming._id.toHexString(), token).expect(201);

    const upcomingRes = await request(ctx.app)
      .get(ctx.api('/me/registrations?when=upcoming'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(upcomingRes.body.data).toHaveLength(1);
    expect(upcomingRes.body.data[0].event.id).toBe(upcoming._id.toHexString());

    const pastRes = await request(ctx.app)
      .get(ctx.api('/me/registrations?when=past'))
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pastRes.body.data).toHaveLength(1);
    expect(pastRes.body.data[0].event.id).toBe(past._id.toHexString());
  });
});
