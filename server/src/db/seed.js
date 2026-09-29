/**
 * Seeds a realistic campus for local development: one admin, eight conveners, 300 students,
 * eight recognised clubs, 41 events spread across the term, and the registrations, waitlists
 * and attendance records that go with them.
 *
 * Every seeded account shares one password (see DEV_PASSWORD) and is hashed once, then
 * reused: 300 argon2 hashes would add half a minute to a command people run all day, and
 * seed accounts are not a secret anyway. Never point this at a production database.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from './connect.js';
import { env, isProd } from '../config/env.js';
import { hashPassword } from '../utils/password.js';
import { User } from '../modules/user/user.model.js';
import { DEPARTMENTS, ROLES } from '../modules/user/user.constants.js';
import { Club } from '../modules/club/club.model.js';
import { ClubFollow } from '../modules/club/clubFollow.model.js';
import { CLUB_STATUS } from '../modules/club/club.constants.js';
import { Event } from '../modules/event/event.model.js';
import { EVENT_STATUS } from '../modules/event/event.constants.js';
import { Registration } from '../modules/registration/registration.model.js';
import { REGISTRATION_STATUS } from '../modules/registration/registration.constants.js';
import { slugify } from '../utils/slug.js';
import { trusted } from '../utils/db.js';
import { sanitizeRichText, toPlainText } from '../utils/sanitizeRichText.js';
import { CLUBS, EVENT_TEMPLATES } from './seedData.js';

export const DEV_PASSWORD = 'Powai-Monsoon-2024';

const DOMAIN = env.ALLOWED_EMAIL_DOMAINS[0];

const FIRST_NAMES = [
  'Aarav',
  'Ananya',
  'Rohan',
  'Ishita',
  'Vikram',
  'Meera',
  'Karthik',
  'Devika',
  'Siddharth',
  'Priya',
  'Arjun',
  'Nandini',
  'Rahul',
  'Sneha',
  'Aditya',
  'Tanvi',
  'Manish',
  'Kavya',
  'Harsh',
  'Shreya',
  'Nikhil',
  'Pooja',
  'Varun',
  'Riya',
  'Abhishek',
  'Aishwarya',
  'Gaurav',
  'Divya',
  'Sanjay',
  'Neha',
  'Imran',
  'Fatima',
  'Joel',
  'Ritika',
  'Yash',
  'Anjali',
];

const LAST_NAMES = [
  'Sharma',
  'Iyer',
  'Nair',
  'Patel',
  'Reddy',
  'Banerjee',
  'Kulkarni',
  'Menon',
  'Desai',
  'Chatterjee',
  'Rao',
  'Malhotra',
  'Joshi',
  'Bhatt',
  'Ghosh',
  'Pillai',
  'Singh',
  'Gupta',
  'Mehta',
  'Namboodiri',
  'Sen',
  'Dutta',
  'Verma',
  'Chauhan',
  'Deshpande',
  'Shetty',
];

/** Deterministic pseudo-random so repeated seeds produce the same roster. */
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const pick = (random, list) => list[Math.floor(random() * list.length)];

/** IIT Bombay style: 2-digit entry year, 2-digit programme, 2-digit department, 3-digit serial. */
function rollNumber(index, year) {
  const entryYear = String(25 - year).padStart(2, '0');
  const department = String(10 + (index % 12)).padStart(2, '0');
  return `${entryYear}00${department}${String(index % 1000).padStart(3, '0')}`;
}

function emailFor(name, rollNumber) {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '.');
  return `${slug}.${rollNumber.slice(-4)}@${DOMAIN}`;
}

const STAFF = [
  {
    name: 'Sudhir Kulkarni',
    email: `dosa.office@${DOMAIN}`,
    role: ROLES.ADMIN,
    department: 'Humanities & Social Sciences',
  },
  {
    name: 'Priya Namboodiri',
    email: `priya.namboodiri.rc@${DOMAIN}`,
    role: ROLES.CLUB_REP,
    rollNumber: '23M030015',
    department: 'Computer Science & Engineering',
    year: 2,
  },
  {
    name: 'Kavish Sitaram',
    email: `kavish.sitaram.sp@${DOMAIN}`,
    role: ROLES.CLUB_REP,
    rollNumber: '210050042',
    department: 'Computer Science & Engineering',
    year: 4,
  },
  {
    name: 'Ritika Bose',
    email: `ritika.bose.ls@${DOMAIN}`,
    role: ROLES.CLUB_REP,
    rollNumber: '220110087',
    department: 'Humanities & Social Sciences',
    year: 3,
  },
  {
    name: 'Imran Qureshi',
    email: `imran.qureshi.qc@${DOMAIN}`,
    role: ROLES.CLUB_REP,
    rollNumber: '220020045',
    department: 'Electrical Engineering',
    year: 3,
  },
];

function buildStudents(passwordHash, count = 300) {
  const random = makeRandom(20241116);
  const students = [];
  const seenEmails = new Set();

  for (let index = 0; students.length < count; index += 1) {
    const name = `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`;
    const year = 1 + Math.floor(random() * 4);
    const roll = rollNumber(index, year);
    const email = emailFor(name, roll);

    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    students.push({
      name,
      email,
      passwordHash,
      role: ROLES.STUDENT,
      rollNumber: roll,
      department: DEPARTMENTS[index % DEPARTMENTS.length],
      year,
      // A handful stay unverified so the "verify your email" path is visible in the UI.
      isEmailVerified: index % 17 !== 0,
    });
  }

  return students;
}

export async function seed({ reset = true, uri } = {}) {
  if (isProd) throw new Error('Refusing to seed a production database.');

  // Reuse an open connection when called from a test; otherwise dial in ourselves.
  if (mongoose.connection.readyState !== 1) {
    await connectDatabase(uri);
  }

  if (reset) {
    await mongoose.connection.dropDatabase();
  }

  const passwordHash = await hashPassword(DEV_PASSWORD);

  const staff = STAFF.map((person) => ({ ...person, passwordHash, isEmailVerified: true }));
  const students = buildStudents(passwordHash);

  const people = await User.insertMany([...staff, ...students], { ordered: false });

  const admin = people.find((person) => person.role === ROLES.ADMIN);
  const conveners = people.filter((person) => person.role === ROLES.CLUB_REP);
  const studentDocs = people.filter((person) => person.role === ROLES.STUDENT);

  const clubs = await seedClubs(conveners, studentDocs);
  const events = await seedEvents(clubs, admin);
  const registrations = await seedRegistrations(events, studentDocs);
  const follows = await seedFollows(clubs, studentDocs);

  return {
    staff: staff.length,
    students: students.length,
    clubs: clubs.length,
    events: events.length,
    registrations,
    follows,
  };
}

/**
 * Eight clubs, each with two conveners. The first four come from the named staff list so the
 * documented sign-in works; the rest are promoted from the student body, which is how it
 * happens in reality anyway.
 */
async function seedClubs(conveners, students) {
  const random = makeRandom(88213);
  const docs = [];

  for (const [index, club] of CLUBS.entries()) {
    const primary = conveners[index % conveners.length];
    const secondary = students[Math.floor(random() * students.length)];

    docs.push({
      ...club,
      slug: slugify(club.name),
      status: CLUB_STATUS.ACTIVE,
      reps: [primary._id, secondary._id],
      followersCount: 0,
    });
  }

  const created = await Club.insertMany(docs);

  // Anyone convening a club is a CLUB_REP, including the students we just drafted in.
  const repIds = created.flatMap((club) => club.reps);
  await User.updateMany({ _id: trusted({ $in: repIds }) }, { $set: { role: ROLES.CLUB_REP } });

  return created;
}

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/**
 * Events are positioned relative to the moment you run the seed, so the board always looks
 * live: a few already finished, one or two tomorrow, the rest across the coming month. Past
 * events are COMPLETED, everything else is PUBLISHED, and one per club is left as a DRAFT so
 * the club desk has something unfinished to look at.
 */
async function seedEvents(clubs, admin) {
  const now = Date.now();
  const docs = [];

  for (const club of clubs) {
    const templates = EVENT_TEMPLATES[club.name] ?? [];

    // Leave the club's furthest-off event as a draft, so every club desk has one piece of
    // unfinished business to look at. Picking "the last template" instead would silently
    // stop working whenever a past-dated entry happened to be last in the list.
    const furthestFutureIndex = templates.reduce(
      (best, template, index) =>
        template[4] > 0 && (best === -1 || template[4] > templates[best][4]) ? index : best,
      -1
    );

    for (const [index, template] of templates.entries()) {
      const [title, category, venue, capacity, offsetDays, durationMinutes, description] = template;

      const startAt = new Date(now + offsetDays * DAY);
      startAt.setHours(index % 2 === 0 ? 16 : 18, index % 2 === 0 ? 0 : 30, 0, 0);

      const isPast = startAt.getTime() < now;
      const isDraft = !isPast && index === furthestFutureIndex;

      docs.push({
        clubId: club._id,
        title,
        slug: slugify(`${title}`),
        description: sanitizeRichText(description),
        summary: toPlainText(description, 180),
        category,
        venue,
        startAt,
        endAt: new Date(startAt.getTime() + durationMinutes * MINUTE),
        registrationDeadline: new Date(startAt.getTime() - (isPast ? 1 : 1) * DAY),
        reportingTime: new Date(startAt.getTime() - 15 * MINUTE),
        capacity,
        registeredCount: 0,
        waitlistedCount: 0,
        waitlistEnabled: index % 4 !== 3,
        eligibility: eligibilityFor(index),
        status: isPast
          ? EVENT_STATUS.COMPLETED
          : isDraft
            ? EVENT_STATUS.DRAFT
            : EVENT_STATUS.PUBLISHED,
        requireFeedbackForCertificate: index % 3 !== 0,
        createdBy: club.reps[0] ?? admin._id,
        publishedAt: isDraft ? undefined : new Date(startAt.getTime() - 20 * DAY),
      });
    }
  }

  // Slugs must be unique; titles repeat across terms in real life, so disambiguate here.
  const seen = new Set();
  for (const doc of docs) {
    let slug = doc.slug;
    let suffix = 2;
    while (seen.has(slug)) slug = `${doc.slug}-${suffix++}`;
    seen.add(slug);
    doc.slug = slug;
  }

  return Event.insertMany(docs);
}

/** Most events are open to everyone; a couple are restricted, to exercise the filter. */
function eligibilityFor(index) {
  if (index === 1) return { years: [1, 2], departments: [] };
  if (index === 3) return { years: [], departments: ['Computer Science & Engineering'] };
  return { years: [], departments: [] };
}

/**
 * Fills each event to a believable level — some quiet, some full with a queue behind them —
 * and marks most attendees present on events that have already happened.
 */
async function seedRegistrations(events, students) {
  const random = makeRandom(4471);
  const rows = [];
  const counters = new Map();

  for (const event of events) {
    if (event.status === EVENT_STATUS.DRAFT) continue;

    const fillRate = 0.35 + random() * 0.85; // some events overflow into the waitlist
    const wanted = Math.min(students.length, Math.round(event.capacity * fillRate));

    const shuffled = [...students].sort(() => random() - 0.5).slice(0, wanted);

    let registered = 0;
    let waitlisted = 0;
    const isPast = event.status === EVENT_STATUS.COMPLETED;

    for (const student of shuffled) {
      const hasSeat = registered < event.capacity;

      if (!hasSeat && !event.waitlistEnabled) continue;

      let status;
      if (!hasSeat) {
        status = REGISTRATION_STATUS.WAITLISTED;
        waitlisted += 1;
      } else if (isPast) {
        // A realistic no-show rate: about one in eight does not turn up.
        status = random() < 0.87 ? REGISTRATION_STATUS.ATTENDED : REGISTRATION_STATUS.NO_SHOW;
        registered += 1;
      } else {
        status = REGISTRATION_STATUS.REGISTERED;
        registered += 1;
      }

      rows.push({
        eventId: event._id,
        userId: student._id,
        status,
        waitlistedAt: status === REGISTRATION_STATUS.WAITLISTED ? new Date() : undefined,
        checkedInAt: status === REGISTRATION_STATUS.ATTENDED ? event.startAt : undefined,
        checkInMethod: status === REGISTRATION_STATUS.ATTENDED ? 'QR' : undefined,
      });
    }

    counters.set(event._id.toHexString(), { registered, waitlisted });
  }

  await Registration.insertMany(rows);

  // Counters are denormalised, so they have to match what we just inserted.
  await Promise.all(
    [...counters.entries()].map(([eventId, count]) =>
      Event.updateOne(
        { _id: eventId },
        { $set: { registeredCount: count.registered, waitlistedCount: count.waitlisted } }
      )
    )
  );

  return rows.length;
}

async function seedFollows(clubs, students) {
  const random = makeRandom(9912);
  const rows = [];
  const tally = new Map();

  for (const student of students) {
    const howMany = Math.floor(random() * 4);
    const picks = [...clubs].sort(() => random() - 0.5).slice(0, howMany);

    for (const club of picks) {
      rows.push({ userId: student._id, clubId: club._id });
      tally.set(club._id.toHexString(), (tally.get(club._id.toHexString()) ?? 0) + 1);
    }
  }

  await ClubFollow.insertMany(rows);

  await Promise.all(
    [...tally.entries()].map(([clubId, count]) =>
      Club.updateOne({ _id: clubId }, { $set: { followersCount: count } })
    )
  );

  return rows.length;
}

// Run directly: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(async (summary) => {
      console.error(
        `Seeded ${summary.staff} staff, ${summary.students} students, ${summary.clubs} clubs, ` +
          `${summary.events} events, ${summary.registrations} registrations, ${summary.follows} follows.`
      );
      console.error(`Every seeded account signs in with: ${DEV_PASSWORD}`);
      console.error(`Admin: ${STAFF[0].email}`);
      console.error(`Club rep: ${STAFF[1].email}`);
      await disconnectDatabase();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await disconnectDatabase();
      process.exit(1);
    });
}
