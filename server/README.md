# CampusConnect API

Express 5, Mongoose 8, MongoDB. ESM throughout. See the root `README.md` for setup, the
session design, and the two deliberate deviations from the brief.

## Response shape

Success is always `{ "data": … }`, optionally with `{ "meta": … }` for pagination.
Failure is always:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention.",
    "details": { "body.email": "Use your college email (@iitb.ac.in)." }
  }
}
```

`details` is keyed by request path so the client can map it straight onto form fields.
`code` is the stable identifier — branch on it, never on `message`.

## Endpoints

| Method  | Path                        | Auth          | Notes                                                              |
| ------- | --------------------------- | ------------- | ------------------------------------------------------------------ |
| `GET`   | `/health`                   | —             | Liveness                                                           |
| `POST`  | `/auth/register`            | —             | 10/hour per IP. Identical response whether or not the email exists |
| `POST`  | `/auth/verify-email`        | —             | Single-use token, 30 min                                           |
| `POST`  | `/auth/resend-verification` | —             | 3/hour. Always reports success                                     |
| `POST`  | `/auth/login`               | —             | 5 failures/15 min per IP+email; successes do not count             |
| `POST`  | `/auth/refresh`             | cookie + CSRF | Rotates. Replay revokes the token family                           |
| `POST`  | `/auth/logout`              | cookie + CSRF | 204                                                                |
| `POST`  | `/auth/forgot-password`     | —             | 3/hour. Always reports success                                     |
| `POST`  | `/auth/reset-password`      | —             | Single-use token, 15 min. Ends every session                       |
| `GET`   | `/auth/me`                  | bearer        | The live user row, not the token's snapshot                        |
| `PATCH` | `/auth/me`                  | bearer        | `name`, `department`, `year` only — unknown keys are a 400         |
| `POST`  | `/auth/change-password`     | bearer        | Ends every other session, returns a fresh one                      |

### Clubs

| Method          | Path                | Auth                       | Notes                                                |
| --------------- | ------------------- | -------------------------- | ---------------------------------------------------- |
| `GET`           | `/clubs`            | optional                   | Active clubs; admins can filter by status            |
| `GET`           | `/clubs/mine`       | rep/admin                  | Clubs the caller convenes                            |
| `GET`           | `/clubs/:slug`      | optional                   | Conveners are named only to people who can manage it |
| `POST`          | `/clubs`            | admin                      |                                                      |
| `PATCH`         | `/clubs/:id`        | rep of that club, or admin | `status` and `reps` are not editable here            |
| `PUT`           | `/clubs/:id/reps`   | admin                      | Reconciles the CLUB_REP role on both sides           |
| `PATCH`         | `/clubs/:id/status` | admin                      |                                                      |
| `POST`/`DELETE` | `/clubs/:id/follow` | verified                   | Idempotent both ways                                 |
| `GET`           | `/clubs/:id/events` | rep of that club, or admin | The register, drafts included                        |

### Events

| Method  | Path                            | Auth                       | Notes                                            |
| ------- | ------------------------------- | -------------------------- | ------------------------------------------------ |
| `GET`   | `/events`                       | optional                   | Filters below; defaults to upcoming              |
| `GET`   | `/events/:slug`                 | optional                   | Unpublished events 404 for outsiders             |
| `POST`  | `/events`                       | rep/admin                  | Always lands as DRAFT                            |
| `PATCH` | `/events/:id`                   | rep of that club, or admin | Published events freeze everything but logistics |
| `POST`  | `/events/:id/publish`           | rep/admin                  | Rep → PENDING_APPROVAL, admin → PUBLISHED        |
| `PATCH` | `/events/:id/approve`           | admin                      | `{ approved, note? }`                            |
| `POST`  | `/events/:id/cancel`            | rep/admin                  | Releases every place, confirmed and waitlisted   |
| `GET`   | `/events/:id/registrations`     | rep of that club, or admin | Paginated, searchable, with status counts        |
| `GET`   | `/events/:id/registrations.csv` | rep of that club, or admin | Formula-injection safe                           |

`GET /events` query: `q` (text index), `category`, `club` (slug), `clubId`, `from`, `to`,
`when` (`upcoming` default / `past` / `all`), `hasSeats`, `openOnly`, `eligibleForMe`,
`status`, `sort` (`soonest` / `latest` / `seats` / `newest`), `page`, `limit` (max 50).

### Registrations

| Method   | Path                   | Auth     | Notes                       |
| -------- | ---------------------- | -------- | --------------------------- |
| `POST`   | `/events/:id/register` | verified | Seat or waitlist; race-safe |
| `DELETE` | `/events/:id/register` | bearer   | Promotes the longest waiter |
| `GET`    | `/me/registrations`    | bearer   | `when=upcoming\|past\|all`  |

All paths are under `API_PREFIX`, which defaults to `/api/v1`.

A generated OpenAPI document at `/api/docs` (development only) is Phase 7.

## Error codes worth handling

| Code                        | Status | Means                                                             |
| --------------------------- | ------ | ----------------------------------------------------------------- |
| `VALIDATION_ERROR`          | 400    | Read `details`                                                    |
| `WEAK_PASSWORD`             | 400    | Policy rejection; `details['body.password']` explains why         |
| `INVALID_CREDENTIALS`       | 401    | Wrong password _or_ unknown account — indistinguishable by design |
| `ACCESS_TOKEN_EXPIRED`      | 401    | Refresh and retry                                                 |
| `SESSION_REVOKED`           | 401    | `tokenVersion` moved: password changed or sessions cleared        |
| `INVALID_REFRESH_TOKEN`     | 401    | Sign in again. May mean reuse was detected                        |
| `CSRF_TOKEN_INVALID`        | 403    | Cookie and `X-CSRF-Token` disagree                                |
| `EMAIL_NOT_VERIFIED`        | 403    | Required before registering for events (Phase 2)                  |
| `ACCOUNT_SUSPENDED`         | 403    | Admin action                                                      |
| `ACCOUNT_LOCKED`            | 423    | Five failed attempts; the message carries the wait                |
| `ROLL_NUMBER_TAKEN`         | 409    | Deliberately explicit — see the root README                       |
| `NOT_A_CLUB_REP`            | 403    | Valid convener, wrong club                                        |
| `NOT_ELIGIBLE`              | 403    | Event is limited by year or department                            |
| `ALREADY_REGISTERED`        | 409    | Includes "already on the waitlist"                                |
| `EVENT_FULL`                | 409    | Full, and the club turned the waitlist off                        |
| `REGISTRATION_CLOSED`       | 409    | Message carries the deadline that passed                          |
| `EVENT_CANCELLED`           | 409    |                                                                   |
| `CAPACITY_BELOW_REGISTERED` | 400    | Cannot shrink a room people are already in                        |
| `EVENT_NOT_EDITABLE`        | 400    | Published: substance is frozen                                    |
| `INVALID_STATUS_TRANSITION` | 400    | e.g. un-cancelling                                                |

## Tests

```bash
npm test
```

99 integration tests against a real in-memory MongoDB **replica set** — a standalone server
cannot start a transaction, and testing a topology production does not use would prove
nothing about the code path that matters. No mocked database, no mocked auth. The mailer is
the one seam that is replaced, and even then the tests read verification tokens out of the
captured message body exactly as a student would read them out of an inbox.

Auth: registration and domain rules, password policy, the enumeration guarantees, lockout
asymmetry, token rotation, refresh-reuse family revocation, CSRF enforcement, `tokenVersion`
invalidation, single-use reset tokens, suspended accounts, forged tokens, mass assignment,
operator injection in bodies and query strings, the 100 kB body cap, and that nothing secret
is stored or returned in clear text.

Clubs and events: visibility rules (students never see drafts; a convener never sees another
club's drafts even when pointing the listing at their club id), every ownership boundary from
both sides, status-transition legality, XSS in event descriptions, formula injection in the
CSV export, and that attendee lists are closed to outsiders.

Registration: 100 concurrent sign-ups for 60 seats landing exactly 60/40, double-tap
protection, waitlist promotion order, seat transfer on cancellation, waitlist drain on a
capacity increase, deadline and eligibility enforcement, and counter/row agreement.

Two known gaps, both by design for now:

- Rate limiters are skipped under `NODE_ENV=test` (`middleware/rateLimit.js`), so the limits
  themselves are unverified. The database-backed account lockout _is_ tested.
- Vitest's CJS interop is more forgiving than Node's ESM resolver. A bad named import can
  pass the suite and still fail at boot — it happened during Phase 1. Run `npm start` against
  a real database before calling a change done.

Fixtures share one argon2 digest rather than hashing per user. Hashing a hundred times is
most of a second per test and was enough to make the concurrency test time out on a loaded
machine; password verification is covered properly by the auth suite, which signs in through
the real endpoint.
