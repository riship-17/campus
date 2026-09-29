import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestServer } from './helpers.js';
import { seed, DEV_PASSWORD } from '../src/db/seed.js';
import { User } from '../src/modules/user/user.model.js';
import { ROLES } from '../src/modules/user/user.constants.js';
import { verifyPassword } from '../src/utils/password.js';
import { trusted } from '../src/utils/db.js';

let ctx;

beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(async () => {
  await ctx.stop();
});

describe('seed script', () => {
  it('produces a usable roster with unique emails and roll numbers', async () => {
    const result = await seed();

    expect(result.students).toBe(300);
    expect(result.clubs).toBe(8);
    expect(result.events).toBeGreaterThanOrEqual(40);
    expect(result.registrations).toBeGreaterThan(0);

    const [total, admins, reps, students] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: ROLES.ADMIN }),
      User.countDocuments({ role: ROLES.CLUB_REP }),
      User.countDocuments({ role: ROLES.STUDENT }),
    ]);

    expect(total).toBe(305);
    expect(admins).toBe(1);
    // Four named conveners plus one student drafted per club.
    expect(reps).toBeGreaterThanOrEqual(4);
    expect(admins + reps + students).toBe(305);

    // The unique indexes would have rejected duplicates, but assert it plainly anyway.
    const distinctEmails = await User.distinct('email');
    const distinctRolls = await User.distinct('rollNumber');
    expect(distinctEmails).toHaveLength(305);
    expect(distinctRolls).toHaveLength(304); // the admin has no roll number

    // Some accounts are deliberately left unverified so that flow is visible in the UI.
    const unverified = await User.countDocuments({ isEmailVerified: false });
    expect(unverified).toBeGreaterThan(0);
  });

  it('gives every seeded account the documented development password', async () => {
    const admin = await User.findOne({ role: ROLES.ADMIN }).select('+passwordHash');
    expect(await verifyPassword(admin.passwordHash, DEV_PASSWORD)).toBe(true);
  });
});

describe('seeded campus', () => {
  it('leaves exactly one draft on every club desk', async () => {
    const { Club } = await import('../src/modules/club/club.model.js');
    const { Event } = await import('../src/modules/event/event.model.js');

    const clubs = await Club.find().lean();
    expect(clubs).toHaveLength(8);

    for (const club of clubs) {
      const drafts = await Event.countDocuments({ clubId: club._id, status: 'DRAFT' });
      expect(drafts, `${club.name} should have one draft`).toBe(1);
    }
  });

  it('never books an event past its own capacity', async () => {
    const { Event } = await import('../src/modules/event/event.model.js');
    const overbooked = await Event.find(
      trusted({ $expr: { $gt: ['$registeredCount', '$capacity'] } })
    ).lean();
    expect(overbooked).toEqual([]);
  });

  it('keeps the denormalised counters in step with the registration rows', async () => {
    const { Event } = await import('../src/modules/event/event.model.js');
    const { Registration } = await import('../src/modules/registration/registration.model.js');

    const events = await Event.find({ status: trusted({ $ne: 'DRAFT' }) }).limit(10);

    for (const event of events) {
      const waitlisted = await Registration.countDocuments({
        eventId: event._id,
        status: 'WAITLISTED',
      });
      expect(event.waitlistedCount, event.title).toBe(waitlisted);
    }
  });
});
