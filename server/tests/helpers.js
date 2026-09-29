import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { Club } from '../src/modules/club/club.model.js';
import { Event } from '../src/modules/event/event.model.js';
import { User } from '../src/modules/user/user.model.js';
import { hashPassword } from '../src/utils/password.js';
import { signAccessToken } from '../src/modules/auth/token.service.js';
import { ROLES } from '../src/modules/user/user.constants.js';
import { CLUB_STATUS } from '../src/modules/club/club.constants.js';
import { EVENT_STATUS } from '../src/modules/event/event.constants.js';

/** Messages captured by the mocked mailer, newest last. */
export const sentMail = [];

/**
 * Boots an isolated in-memory MongoDB and the real Express app for a test file.
 * Returns helpers the suites share.
 */
export async function startTestServer() {
  /**
   * A single-node replica set rather than a standalone `mongod`, because registration runs
   * inside a transaction and a standalone server cannot start one. Testing against the
   * topology production uses is the whole point.
   */
  const mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const { connectDatabase } = await import('../src/db/connect.js');
  await connectDatabase(mongo.getUri());

  const { createApp } = await import('../src/app.js');
  const app = createApp();

  return {
    app,
    api: (path) => `/api/v1${path}`,
    async stop() {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
      await mongo.stop();
    },
    async reset() {
      const collections = await mongoose.connection.db.collections();
      await Promise.all(collections.map((c) => c.deleteMany({})));
      sentMail.length = 0;
    },
  };
}

/** Pulls the `?token=` value out of the most recent email matching a subject fragment. */
export function tokenFromMail(subjectFragment) {
  const message = [...sentMail].reverse().find((mail) => mail.subject.includes(subjectFragment));
  if (!message) throw new Error(`No email sent with subject containing "${subjectFragment}"`);
  const match = message.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`No token found in email "${message.subject}"`);
  return decodeURIComponent(match[1]);
}

export const VALID_PASSWORD = 'Kanwal-Rekhi-2024!';

export async function registerAndVerify(app, overrides = {}) {
  const user = {
    name: 'Aarav Sharma',
    email: 'aarav.sharma@iitb.ac.in',
    password: VALID_PASSWORD,
    rollNumber: '210050114',
    department: 'Computer Science & Engineering',
    year: 4,
    ...overrides,
  };

  await request(app).post('/api/v1/auth/register').send(user).expect(201);
  const token = tokenFromMail('Confirm your CampusConnect email');
  await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(200);

  return user;
}

/** Signs in and returns the access token plus the cookie jar the client would hold. */
export async function signIn(app, { email, password }) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return {
    accessToken: res.body.data.accessToken,
    csrfToken: res.body.data.csrfToken,
    cookies: res.headers['set-cookie'],
    user: res.body.data.user,
  };
}

/** Extracts a single cookie's value from a Set-Cookie array. */
export function readCookie(cookies, name) {
  const entry = (cookies ?? []).find((cookie) => cookie.startsWith(`${name}=`));
  if (!entry) return null;
  return decodeURIComponent(entry.split(';')[0].split('=').slice(1).join('='));
}

/* --------------------------------------------------------------- Phase 2 helpers */

const DAY = 24 * 60 * 60 * 1000;

/**
 * argon2 is deliberately expensive — roughly 64 MB and a few hundred milliseconds a go. That
 * is correct for a login and ruinous for a fixture: the concurrency test needs a hundred
 * students, and hashing the same password a hundred times was most of its runtime (and the
 * reason it timed out on a loaded machine).
 *
 * Hash it once, reuse the digest. Password *verification* is exercised properly by the auth
 * suite, which signs in through the real endpoint.
 */
let fixturePasswordHash;
async function sharedPasswordHash() {
  fixturePasswordHash ??= await hashPassword(VALID_PASSWORD);
  return fixturePasswordHash;
}

/**
 * Creates a verified account directly, skipping the email round-trip.
 *
 * Only for fixtures — registration and verification are exercised through the real endpoints
 * in auth.test.js.
 */
export async function makeUser(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return User.create({
    name: overrides.name ?? `Test Student ${suffix}`,
    email: overrides.email ?? `student.${suffix}@iitb.ac.in`,
    passwordHash: await sharedPasswordHash(),
    role: overrides.role ?? ROLES.STUDENT,
    rollNumber: overrides.rollNumber ?? `21${suffix.toUpperCase().slice(0, 7)}`,
    department: overrides.department ?? 'Computer Science & Engineering',
    year: overrides.year ?? 3,
    isEmailVerified: overrides.isEmailVerified ?? true,
    ...(overrides.status ? { status: overrides.status } : {}),
  });
}

export async function makeClub(overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  return Club.create({
    name: overrides.name ?? `Test Club ${suffix}`,
    slug: overrides.slug ?? `test-club-${suffix}`,
    description:
      overrides.description ?? 'A club that exists so that a test has something to point at.',
    category: overrides.category ?? 'Technical',
    status: overrides.status ?? CLUB_STATUS.ACTIVE,
    reps: overrides.reps ?? [],
  });
}

export async function makeEvent(club, overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const startAt = overrides.startAt ?? new Date(Date.now() + 7 * DAY);

  return Event.create({
    clubId: club._id,
    title: overrides.title ?? `Test Event ${suffix}`,
    slug: overrides.slug ?? `test-event-${suffix}`,
    description:
      overrides.description ?? '<p>Something happens, and you should bring a laptop.</p>',
    category: overrides.category ?? 'Workshop',
    venue: overrides.venue ?? 'Seminar Hall B, VMCC',
    startAt,
    endAt: overrides.endAt ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
    registrationDeadline: overrides.registrationDeadline ?? new Date(startAt.getTime() - DAY),
    capacity: overrides.capacity ?? 30,
    waitlistEnabled: overrides.waitlistEnabled ?? true,
    eligibility: overrides.eligibility ?? { years: [], departments: [] },
    status: overrides.status ?? EVENT_STATUS.PUBLISHED,
    createdBy: overrides.createdBy ?? club.reps[0] ?? (await makeUser())._id,
    ...(overrides.registeredCount !== undefined
      ? { registeredCount: overrides.registeredCount }
      : {}),
  });
}

/**
 * A bearer token for a fixture user, minted directly.
 *
 * Deliberately not a round-trip through POST /auth/login: that path has its own tests, and
 * paying for a hundred real sign-ins here would mean the concurrency test spends its time
 * measuring argon2 rather than the seat race it exists to prove.
 */
export function tokenFor(_app, user) {
  return signAccessToken(user);
}

export { DAY };
