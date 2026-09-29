import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
  readCookie,
  registerAndVerify,
  signIn,
  startTestServer,
  tokenFromMail,
  VALID_PASSWORD,
} from './helpers.js';

let ctx;

beforeAll(async () => {
  ctx = await startTestServer();
});
afterAll(async () => {
  await ctx.stop();
});
beforeEach(async () => {
  await ctx.reset();
  await registerAndVerify(ctx.app);
});

const EMAIL = 'aarav.sharma@iitb.ac.in';

const refresh = (session) =>
  request(ctx.app)
    .post(ctx.api('/auth/refresh'))
    .set('Cookie', session.cookies)
    .set('X-CSRF-Token', session.csrfToken);

describe('POST /auth/refresh', () => {
  it('rotates the refresh token on every use', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });
    const firstRefresh = readCookie(session.cookies, 'cc_refresh');

    const res = await refresh(session).expect(200);
    const secondRefresh = readCookie(res.headers['set-cookie'], 'cc_refresh');

    expect(secondRefresh).toBeTruthy();
    expect(secondRefresh).not.toBe(firstRefresh);
    expect(res.body.data.accessToken).toBeTypeOf('string');
  });

  it('revokes the whole family when a retired token is replayed', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    const rotated = await refresh(session).expect(200);
    const liveSession = {
      cookies: rotated.headers['set-cookie'],
      csrfToken: readCookie(rotated.headers['set-cookie'], 'cc_csrf'),
    };

    // Replay the token that rotation already retired — the signature of a stolen cookie.
    await refresh(session).expect(401);

    // The legitimate successor must now be dead too, forcing a fresh sign-in.
    await refresh(liveSession).expect(401);
  });

  it('requires the double-submit CSRF header', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    const missing = await request(ctx.app)
      .post(ctx.api('/auth/refresh'))
      .set('Cookie', session.cookies)
      .expect(403);
    expect(missing.body.error.code).toBe('CSRF_TOKEN_INVALID');

    await request(ctx.app)
      .post(ctx.api('/auth/refresh'))
      .set('Cookie', session.cookies)
      .set('X-CSRF-Token', 'not-the-right-value')
      .expect(403);
  });

  it('fails with no cookie at all', async () => {
    await request(ctx.app).post(ctx.api('/auth/refresh')).expect(401);
  });
});

describe('POST /auth/logout', () => {
  it('kills the refresh token so it cannot be reused', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    await request(ctx.app)
      .post(ctx.api('/auth/logout'))
      .set('Cookie', session.cookies)
      .set('X-CSRF-Token', session.csrfToken)
      .expect(204);

    await refresh(session).expect(401);
  });
});

describe('password changes end every session', () => {
  it('invalidates existing access tokens via tokenVersion', async () => {
    const laptop = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });
    const phone = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    const changed = await request(ctx.app)
      .post(ctx.api('/auth/change-password'))
      .set('Authorization', `Bearer ${laptop.accessToken}`)
      .send({ currentPassword: VALID_PASSWORD, newPassword: 'Powai-Lake-Monsoon-9' })
      .expect(200);

    // The other device's access token is dead immediately, without any blacklist.
    const phoneAfter = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${phone.accessToken}`)
      .expect(401);
    expect(phoneAfter.body.error.code).toBe('SESSION_REVOKED');

    // …and its refresh token cannot mint a new one.
    await refresh(phone).expect(401);

    // The device that made the change keeps working on its freshly issued session.
    await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${changed.body.data.accessToken}`)
      .expect(200);
  });

  it('refuses a new password that matches the current one', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    const res = await request(ctx.app)
      .post(ctx.api('/auth/change-password'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ currentPassword: VALID_PASSWORD, newPassword: VALID_PASSWORD })
      .expect(400);

    expect(res.body.error.code).toBe('PASSWORD_REUSED');
  });
});

describe('password reset', () => {
  it('answers identically for known and unknown addresses', async () => {
    const known = await request(ctx.app)
      .post(ctx.api('/auth/forgot-password'))
      .send({ email: EMAIL })
      .expect(200);

    const unknown = await request(ctx.app)
      .post(ctx.api('/auth/forgot-password'))
      .send({ email: 'ghost.account@iitb.ac.in' })
      .expect(200);

    expect(known.body).toEqual(unknown.body);
  });

  it('resets once, then refuses the same link', async () => {
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    await request(ctx.app)
      .post(ctx.api('/auth/forgot-password'))
      .send({ email: EMAIL })
      .expect(200);
    const token = tokenFromMail('Reset your CampusConnect password');

    await request(ctx.app)
      .post(ctx.api('/auth/reset-password'))
      .send({ token, password: 'Hostel-Twelve-Mess-3' })
      .expect(200);

    // Single use.
    await request(ctx.app)
      .post(ctx.api('/auth/reset-password'))
      .send({ token, password: 'Another-Fresh-Password-7' })
      .expect(400);

    // Every session opened before the reset is gone.
    await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(401);

    await signIn(ctx.app, { email: EMAIL, password: 'Hostel-Twelve-Mess-3' });
  });

  it('clears an active lockout so a locked-out owner can recover', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(ctx.app)
        .post(ctx.api('/auth/login'))
        .send({ email: EMAIL, password: `wrong-${attempt}` })
        .expect(401);
    }

    await request(ctx.app)
      .post(ctx.api('/auth/forgot-password'))
      .send({ email: EMAIL })
      .expect(200);
    const token = tokenFromMail('Reset your CampusConnect password');

    await request(ctx.app)
      .post(ctx.api('/auth/reset-password'))
      .send({ token, password: 'Gulmohar-Gully-Open-4' })
      .expect(200);

    await signIn(ctx.app, { email: EMAIL, password: 'Gulmohar-Gully-Open-4' });
  });
});
