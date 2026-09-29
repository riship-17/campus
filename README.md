# CampusConnect

One notice board for a college campus: clubs post events, students register, attendance is
scanned at the door, and certificates are issued against that scan — so what a certificate
claims actually happened.

Monorepo, two apps:

```
client/   React 18 + Vite    — the notice board
server/   Express 5 + Mongoose — the register
```

---

## Build status

The project is being built in the phases set out in the brief, with a review point after each.

| Phase | Scope                                                  | Status                |
| ----- | ------------------------------------------------------ | --------------------- |
| 1     | Repo setup, auth, RBAC, user model                     | Done                  |
| 2     | Clubs, events, registration with capacity and waitlist | **Done — this build** |
| 3     | QR attendance                                          | Not started           |
| 4     | Feedback, certificates, public verification            | Not started           |
| 5     | Notifications, email, background jobs                  | Not started           |
| 6     | Admin analytics and audit logs                         | Not started           |
| 7     | Tests, hardening, deployment                           | Not started           |

**Phase 1** delivered the account: sign-up restricted to college domains, email verification,
argon2id sign-in with account lockout, rotating refresh tokens with reuse detection, CSRF
double-submit, password reset and change, and role-based guards on both sides.

**Phase 2** delivers the board: eight clubs, 41 events, discovery with URL-synced filters and
full-text search, race-safe registration with a waitlist that promotes automatically, a club
desk for conveners (event register, multi-section create/edit form, attendee list, CSV
export), and an approval step through the SAC office. 99 integration tests.

What is deliberately still a stub: the entry pass shows a ticket reference and says plainly
that the scannable version arrives with the attendance scanner, rather than shipping a static
QR that looks like a live pass and is not one. Admin analytics, feedback and certificates are
later phases and their screens say so.

---

## Running it locally

You need Node 20.11+ and a MongoDB you can write to (local `mongod`, or a free Atlas cluster).

```bash
# API
cd server
cp .env.example .env          # then fill in the three secrets — see below
npm install
npm run seed                  # 1 admin, 4 club conveners, 300 students
npm run dev                   # http://localhost:4000/api/v1

# Client, in a second terminal
cd client
cp .env.example .env
npm install
npm run dev                   # http://localhost:5173
```

Generate each secret separately — never reuse one value across the three:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The server validates its whole environment with Zod at startup and exits with a list of what
is missing rather than booting half-configured.

### Signing in to the seeded data

`npm run seed` builds a campus in November: 8 recognised clubs, 41 events spread from a month
back to six weeks ahead, ~2,250 registrations with realistic fill rates (some quiet, some full
with a queue behind them), attendance marked on everything that already happened, and one
unfinished draft on every club desk.

Every seeded account uses the password `Powai-Monsoon-2024`.

| Role     | Email                                                                  |
| -------- | ---------------------------------------------------------------------- |
| Admin    | `dosa.office@iitb.ac.in`                                               |
| Club rep | `priya.namboodiri.rc@iitb.ac.in` (convenes Robotics and LitSoc)        |
| Student  | any address printed by `npm run seed`, or query the `users` collection |

### A note on MongoDB topology

Registration runs inside a transaction, which needs a replica set — any Atlas cluster is one.
A standalone local `mongod` is not, and the server says so on startup and falls back to
guarded counters plus compensating writes. That fallback is still correct (the seat claim is a
single atomic `findOneAndUpdate` either way), but run a replica set in production.

To get one locally: `mongod --replSet rs0 --dbpath ./data` then `mongosh --eval "rs.initiate()"`.

### Email in development

With no `SMTP_*` variables set, the mailer writes messages to the log instead of sending
them. The verification and reset links appear in your terminal, which is faster than wiring
up a mail catcher and avoids showing a fake "sent!" for mail that went nowhere.

---

## Commands

```bash
# server/
npm run dev          # watch mode
npm start            # production entrypoint
npm test             # 35 integration tests against an in-memory MongoDB
npm run seed         # reset and repopulate the roster
npm run lint
npm run audit:ci     # fails on high or critical advisories

# client/
npm run dev
npm run build
npm run lint
```

---

## How the session works

This is the part most worth reading before Phase 2 builds on it.

**Access token** — a 15-minute HS256 JWT carrying only `{ sub, role, tokenVersion }`. The
client holds it in a module closure in memory. Not localStorage, not a readable cookie. A
reload loses it, which is the point.

**Refresh token** — 64 random bytes, stored in the database as an HMAC digest (keyed with
`TOKEN_PEPPER`, so a database dump alone cannot be replayed), delivered as an httpOnly,
`SameSite=Strict` cookie scoped to `/api/v1/auth`. Every use rotates it.

**Reuse detection** — rotated tokens are marked revoked, not deleted. Presenting an
already-revoked token is the signature of a stolen cookie being replayed, so the entire token
family is revoked and both parties must sign in again.

**Killing sessions instantly** — a JWT cannot be un-issued, so `authenticate` reads the live
user row on every request and compares `tokenVersion`. Changing a password, resetting one, or
suspending an account bumps that number and every outstanding access token dies at once, with
no blacklist to maintain.

**CSRF** — `SameSite=Strict` does most of the work; a double-submit token (readable cookie
echoed in `X-CSRF-Token`) covers the remainder on the three cookie-authenticated endpoints.

**The refresh queue** — the client shares one in-flight refresh across every request that
401s simultaneously. Without it, a dashboard firing six queries on mount would rotate the
refresh token six times in parallel, and the server would correctly read that as an attack.

### Enumeration and lockout

Sign-in answers identically for a wrong password and an unknown address, and spends the same
wall-clock time on both (unknown addresses are verified against a decoy hash).

Lockout is the one place with a deliberate asymmetry: after five failures the account locks
for fifteen minutes, but it only _says_ so when the password supplied is correct. Someone
guessing passwords sees the same generic rejection whether the account exists, is locked, or
neither. The real owner, who knows their password, is told exactly why they are being turned
away and for how long.

Registration hides email conflicts the same way — the response is byte-identical, and the
existing owner gets a "you already have an account" message instead. Roll-number conflicts
_do_ return a plain 409: on a campus where addresses derive from roll numbers, hiding that
would be theatre, and a student who mistypes their roll number needs to be told.

---

## Deviations from the brief

Two, both deliberate:

**React Router 7 instead of 6.** Every published v6 release is affected by two open
advisories (open redirect via backslash in `Link`/`useNavigate`, and constructor injection in
`deserializeErrors`) with no v6 patch — the fix only exists in 7.18.4. Since v7's
`BrowserRouter`/`Routes`/`Route` API is source-compatible with the v6 usage here, taking the
patched major cost nothing. Security was listed as non-negotiable, so it won.

**Rate limiting uses the in-process memory store, not Redis.** Redis arrives in Phase 5 with
BullMQ. Until then the limits are correct for a single API process and wrong for several —
so do not scale the API past one instance before Phase 5. `middleware/rateLimit.js` says the
same thing where it matters.

### The `trusted()` convention

`mongoose.set('sanitizeFilter', true)` neutralises _every_ nested `$`-operator object,
including ones the server writes itself. Server-built operators therefore go through
`trusted()` in `server/src/utils/db.js`, which — unlike Mongoose's own one-level version —
descends through nested clauses, because `trusted({ $or: [{ years: { $size: 0 } }] })` looks
marked but leaves the inner `$size` to be rewritten into a cast error one layer down.

Forgetting to wrap something degrades the query to a harmless no-match or a loud cast error
rather than opening an injection point, so the failure mode points the safe way. It is still
the thing most likely to trip up the next phase.

---

## Layout

```
server/src/
  config/        env (Zod-validated, fails fast) and the pino logger
  db/            connection, seed script
  middleware/    auth, validate, sanitize, csrf, rateLimit, errorHandler
  modules/
    auth/        routes → controller → service, token service, cookies, schemas
    user/        model and constants
    audit/       append-only action log
    mail/        transport and templates
  utils/         ApiError, crypto, password, db helpers
  app.js         middleware pipeline
  server.js      boot and graceful shutdown

client/src/
  components/ui/      Button, FormField, Tag, Notice, Skeleton, EmptyState,
                      DateBlock, SeatBar, Tabs, Table, Modal, Pagination, Toast
  components/layout/  Masthead, Colophon, AppLayout
  features/auth/      provider, context, schemas mirroring the server
  features/events/    API, query hooks, card and filter rail, form schema
  features/clubs/     API and query hooks with optimistic follow
  lib/                axios client with the refresh queue, error normaliser,
                      Indian-locale formatting, URL-synced filter hook
  pages/              split by area and lazy-loaded
  routes/             guards and the per-route error boundary
  styles/index.css    the design tokens
```

---

## How registration stays correct

The obvious implementation — read `registeredCount`, compare with `capacity`, increment — is
a lost-update race. A hundred people tapping Register in the same second for sixty seats all
read 59 and all decide there is room.

Instead the seat is claimed with one atomic `findOneAndUpdate` whose filter uses `$expr` to
compare the two fields _inside_ the document, so MongoDB evaluates the guard and applies the
increment under a single document lock. Exactly `capacity` claims can succeed no matter how
many arrive at once — and that property holds with or without a transaction. The transaction
adds the second guarantee: that the seat claim and the registration row commit together.

Cancelling transfers the seat rather than releasing it. Decrementing the counter first would
open a window, however brief, in which a passer-by could take a seat that belongs to the
person at the top of the queue; promoting directly closes it.

`tests/registration.test.js` fires 100 concurrent registrations at a 60-seat event and asserts
that exactly 60 are confirmed, 40 are waitlisted, and the denormalised counters match the rows.
