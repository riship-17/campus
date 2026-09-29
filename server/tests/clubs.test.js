import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { makeClub, makeEvent, makeUser, startTestServer, tokenFor } from './helpers.js';
import { Club } from '../src/modules/club/club.model.js';
import { User } from '../src/modules/user/user.model.js';
import { ClubFollow } from '../src/modules/club/clubFollow.model.js';
import { CLUB_STATUS } from '../src/modules/club/club.constants.js';
import { ROLES } from '../src/modules/user/user.constants.js';

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

describe('GET /clubs', () => {
  it('lists only active clubs to the public', async () => {
    await makeClub({ name: 'Robotics Club', slug: 'robotics-club' });
    await makeClub({
      name: 'Pending Petition',
      slug: 'pending-petition',
      status: CLUB_STATUS.PENDING,
    });

    const res = await request(ctx.app).get(ctx.api('/clubs')).expect(200);
    expect(res.body.data.map((club) => club.name)).toEqual(['Robotics Club']);
  });

  it('shows an admin everything, filtered by status', async () => {
    await makeClub({ name: 'Active One', slug: 'active-one' });
    await makeClub({ name: 'Pending One', slug: 'pending-one', status: CLUB_STATUS.PENDING });

    const token = await tokenFor(ctx.app, await makeUser({ role: ROLES.ADMIN }));

    const all = await request(ctx.app).get(ctx.api('/clubs')).set(auth(token)).expect(200);
    expect(all.body.data).toHaveLength(2);

    const pending = await request(ctx.app)
      .get(ctx.api('/clubs?status=PENDING'))
      .set(auth(token))
      .expect(200);
    expect(pending.body.data.map((club) => club.name)).toEqual(['Pending One']);
  });

  it('never names conveners in the public listing', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP, name: 'Priya Namboodiri' });
    await makeClub({ name: 'Robotics Club', slug: 'robotics-club', reps: [rep._id] });

    const res = await request(ctx.app).get(ctx.api('/clubs/robotics-club')).expect(200);

    expect(res.body.data.name).toBe('Robotics Club');
    expect(res.body.data.reps).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('Priya Namboodiri');
  });

  it('names conveners to someone who can act on the club', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP, name: 'Priya Namboodiri' });
    await makeClub({ name: 'Robotics Club', slug: 'robotics-club', reps: [rep._id] });

    const res = await request(ctx.app)
      .get(ctx.api('/clubs/robotics-club'))
      .set(auth(await tokenFor(ctx.app, rep)))
      .expect(200);

    expect(res.body.data.canManage).toBe(true);
    expect(res.body.data.reps.map((entry) => entry.name)).toEqual(['Priya Namboodiri']);
  });
});

describe('following a club', () => {
  it('is idempotent and keeps the counter honest', async () => {
    const club = await makeClub();
    const token = await tokenFor(ctx.app, await makeUser());
    const url = ctx.api(`/clubs/${club._id}/follow`);

    await request(ctx.app).post(url).set(auth(token)).expect(200);
    const second = await request(ctx.app).post(url).set(auth(token)).expect(200);

    expect(second.body.data.isFollowing).toBe(true);
    expect(await ClubFollow.countDocuments({ clubId: club._id })).toBe(1);
    expect((await Club.findById(club._id)).followersCount).toBe(1);
  });

  it('never drives the counter below zero on a repeated unfollow', async () => {
    const club = await makeClub();
    const token = await tokenFor(ctx.app, await makeUser());
    const url = ctx.api(`/clubs/${club._id}/follow`);

    await request(ctx.app).post(url).set(auth(token)).expect(200);
    await request(ctx.app).delete(url).set(auth(token)).expect(200);
    const again = await request(ctx.app).delete(url).set(auth(token)).expect(200);

    expect(again.body.data.followersCount).toBe(0);
    expect((await Club.findById(club._id)).followersCount).toBe(0);
  });

  it('requires a confirmed email before following', async () => {
    const club = await makeClub();
    const token = await tokenFor(ctx.app, await makeUser({ isEmailVerified: false }));

    const res = await request(ctx.app)
      .post(ctx.api(`/clubs/${club._id}/follow`))
      .set(auth(token))
      .expect(403);

    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('PATCH /clubs/:id', () => {
  it('lets a convener edit their own club', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const club = await makeClub({ reps: [rep._id] });

    const res = await request(ctx.app)
      .patch(ctx.api(`/clubs/${club._id}`))
      .set(auth(await tokenFor(ctx.app, rep)))
      .send({ room: "Tinkerer's Lab, Bay 02" })
      .expect(200);

    expect(res.body.data.room).toBe("Tinkerer's Lab, Bay 02");
  });

  /** A convener with a valid token, pointed at a club that is not theirs. */
  it('stops a convener editing somebody else’s club', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    await makeClub({ name: 'My Club', slug: 'my-club', reps: [rep._id] });
    const otherClub = await makeClub({ name: 'Their Club', slug: 'their-club' });

    const res = await request(ctx.app)
      .patch(ctx.api(`/clubs/${otherClub._id}`))
      .set(auth(await tokenFor(ctx.app, rep)))
      .send({ room: 'Somewhere I do not belong' })
      .expect(403);

    expect(res.body.error.code).toBe('NOT_A_CLUB_REP');
    expect((await Club.findById(otherClub._id)).room).toBeUndefined();
  });

  it('cannot be used to approve a club or appoint a convener', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const club = await makeClub({ reps: [rep._id], status: CLUB_STATUS.ACTIVE });
    const token = await tokenFor(ctx.app, rep);

    await request(ctx.app)
      .patch(ctx.api(`/clubs/${club._id}`))
      .set(auth(token))
      .send({ status: CLUB_STATUS.ACTIVE, reps: [rep._id.toHexString()] })
      .expect(400);

    const stored = await Club.findById(club._id);
    expect(stored.reps).toHaveLength(1);
  });
});

describe('PUT /clubs/:id/reps', () => {
  it('promotes appointed students and demotes those who lose their last club', async () => {
    const admin = await makeUser({ role: ROLES.ADMIN });
    const adminToken = await tokenFor(ctx.app, admin);

    const outgoing = await makeUser({ role: ROLES.CLUB_REP });
    const incoming = await makeUser();
    const club = await makeClub({ reps: [outgoing._id] });

    await request(ctx.app)
      .put(ctx.api(`/clubs/${club._id}/reps`))
      .set(auth(adminToken))
      .send({ repIds: [incoming._id.toHexString()] })
      .expect(200);

    expect((await User.findById(incoming._id)).role).toBe(ROLES.CLUB_REP);
    expect((await User.findById(outgoing._id)).role).toBe(ROLES.STUDENT);
  });

  it('keeps CLUB_REP for someone who still convenes another club', async () => {
    const adminToken = await tokenFor(ctx.app, await makeUser({ role: ROLES.ADMIN }));

    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const clubA = await makeClub({ name: 'Club A', slug: 'club-a', reps: [rep._id] });
    await makeClub({ name: 'Club B', slug: 'club-b', reps: [rep._id] });

    await request(ctx.app)
      .put(ctx.api(`/clubs/${clubA._id}/reps`))
      .set(auth(adminToken))
      .send({ repIds: [] })
      .expect(200);

    expect((await User.findById(rep._id)).role).toBe(ROLES.CLUB_REP);
  });

  it('is closed to conveners', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const club = await makeClub({ reps: [rep._id] });
    const accomplice = await makeUser();

    const res = await request(ctx.app)
      .put(ctx.api(`/clubs/${club._id}/reps`))
      .set(auth(await tokenFor(ctx.app, rep)))
      .send({ repIds: [rep._id.toHexString(), accomplice._id.toHexString()] })
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_FORBIDDEN');
    expect((await Club.findById(club._id)).reps).toHaveLength(1);
  });
});

describe('GET /clubs/mine', () => {
  it('returns only the clubs the caller convenes', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    await makeClub({ name: 'Mine', slug: 'mine', reps: [rep._id] });
    await makeClub({ name: 'Not mine', slug: 'not-mine' });

    const res = await request(ctx.app)
      .get(ctx.api('/clubs/mine'))
      .set(auth(await tokenFor(ctx.app, rep)))
      .expect(200);

    expect(res.body.data.map((club) => club.name)).toEqual(['Mine']);
  });
});

describe('a suspended club', () => {
  it('cannot have new events listed against it', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const club = await makeClub({ reps: [rep._id], status: CLUB_STATUS.SUSPENDED });

    const res = await request(ctx.app)
      .post(ctx.api('/events'))
      .set(auth(await tokenFor(ctx.app, rep)))
      .send({
        clubId: club._id.toHexString(),
        title: 'An event that should not exist',
        description: '<p>Something the club is not currently allowed to run.</p>',
        category: 'Workshop',
        venue: 'Seminar Hall B',
        startAt: new Date(Date.now() + 8 * 864e5).toISOString(),
        endAt: new Date(Date.now() + 8 * 864e5 + 72e5).toISOString(),
        registrationDeadline: new Date(Date.now() + 7 * 864e5).toISOString(),
        capacity: 20,
      })
      .expect(403);

    expect(res.body.error.code).toBe('CLUB_NOT_ACTIVE');
  });

  it('disappears from the public register along with nothing else', async () => {
    const club = await makeClub({ name: 'Suspended Club', slug: 'suspended-club' });
    await makeEvent(club, { title: 'Already listed workshop' });

    await Club.updateOne({ _id: club._id }, { $set: { status: CLUB_STATUS.SUSPENDED } });

    await request(ctx.app).get(ctx.api('/clubs/suspended-club')).expect(404);

    // The club is hidden; its already-published listing is a separate decision.
    const events = await request(ctx.app).get(ctx.api('/events')).expect(200);
    expect(events.body.data.map((event) => event.title)).toContain('Already listed workshop');
  });
});

describe('GET /clubs/:id/events', () => {
  it('gives a convener their own register, drafts and all', async () => {
    const rep = await makeUser({ role: ROLES.CLUB_REP });
    const club = await makeClub({ reps: [rep._id] });
    await makeEvent(club, { title: 'Published one' });
    await makeEvent(club, { title: 'Draft one', status: 'DRAFT' });

    const res = await request(ctx.app)
      .get(ctx.api(`/clubs/${club._id}/events`))
      .set(auth(await tokenFor(ctx.app, rep)))
      .expect(200);

    expect(res.body.data.map((event) => event.title).sort()).toEqual([
      'Draft one',
      'Published one',
    ]);
  });

  it('is closed to a convener of another club', async () => {
    const outsider = await makeUser({ role: ROLES.CLUB_REP });
    await makeClub({ name: 'Outsider', slug: 'outsider', reps: [outsider._id] });
    const club = await makeClub({ name: 'Target', slug: 'target' });
    await makeEvent(club, { title: 'Not yours', status: 'DRAFT' });

    const res = await request(ctx.app)
      .get(ctx.api(`/clubs/${club._id}/events`))
      .set(auth(await tokenFor(ctx.app, outsider)))
      .expect(403);

    expect(res.body.error.code).toBe('NOT_A_CLUB_REP');
  });
});
