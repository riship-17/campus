import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import {
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
});

const newUser = {
  name: 'Aarav Sharma',
  email: 'aarav.sharma@iitb.ac.in',
  password: VALID_PASSWORD,
  rollNumber: '210050114',
  department: 'Computer Science & Engineering',
  year: 4,
};

describe('POST /auth/register', () => {
  it('creates an unverified account and emails a confirmation link', async () => {
    const res = await request(ctx.app).post(ctx.api('/auth/register')).send(newUser).expect(201);

    expect(res.body.data.emailSentTo).toBe(newUser.email);
    expect(() => tokenFromMail('Confirm your CampusConnect email')).not.toThrow();
  });

  it('rejects addresses outside the allowed college domains', async () => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/register'))
      .send({ ...newUser, email: 'aarav@gmail.com' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details['body.email']).toMatch(/college email/i);
  });

  it.each([
    ['too short', 'Short1!'],
    ['a common password', 'password123'],
    ['derived from the email local part', 'aarav.sharma-2024'],
  ])('rejects a password that is %s', async (_label, password) => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/register'))
      .send({ ...newUser, password })
      .expect(400);

    expect(res.body.error.details['body.password']).toBeTruthy();
  });

  it('refuses unknown keys so a client cannot self-assign a role', async () => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/register'))
      .send({ ...newUser, role: 'ADMIN' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not reveal that an email is already registered', async () => {
    await request(ctx.app).post(ctx.api('/auth/register')).send(newUser).expect(201);

    const second = await request(ctx.app)
      .post(ctx.api('/auth/register'))
      .send({ ...newUser, rollNumber: '210050999', name: 'Someone Else' })
      .expect(201);

    expect(second.body.data.emailSentTo).toBe(newUser.email);
  });
});

describe('POST /auth/verify-email', () => {
  it('confirms the address and burns the token', async () => {
    await request(ctx.app).post(ctx.api('/auth/register')).send(newUser).expect(201);
    const token = tokenFromMail('Confirm your CampusConnect email');

    const first = await request(ctx.app)
      .post(ctx.api('/auth/verify-email'))
      .send({ token })
      .expect(200);
    expect(first.body.data.user.isEmailVerified).toBe(true);

    await request(ctx.app).post(ctx.api('/auth/verify-email')).send({ token }).expect(400);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await registerAndVerify(ctx.app);
  });

  it('returns an access token in the body and the refresh token only as an httpOnly cookie', async () => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: newUser.email, password: VALID_PASSWORD })
      .expect(200);

    expect(res.body.data.accessToken).toBeTypeOf('string');
    expect(JSON.stringify(res.body)).not.toContain('cc_refresh');

    const cookies = res.headers['set-cookie'];
    const refresh = cookies.find((c) => c.startsWith('cc_refresh='));
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/);

    // The CSRF companion must be readable by our own JS, so it is deliberately not httpOnly.
    const csrf = cookies.find((c) => c.startsWith('cc_csrf='));
    expect(csrf).not.toMatch(/HttpOnly/i);
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    const wrongPassword = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: newUser.email, password: 'Definitely-Not-It-1' })
      .expect(401);

    const unknownUser = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: 'nobody.here@iitb.ac.in', password: 'Definitely-Not-It-1' })
      .expect(401);

    expect(wrongPassword.body.error).toEqual(unknownUser.body.error);
    expect(wrongPassword.body.error.message).toBe('Invalid email or password.');
  });

  it('ignores a MongoDB operator smuggled in place of an email', async () => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: { $ne: null }, password: { $ne: null } })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('locks the account after five failures and says so only to whoever knows the password', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(ctx.app)
        .post(ctx.api('/auth/login'))
        .send({ email: newUser.email, password: `wrong-guess-${attempt}` })
        .expect(401);
    }

    // An attacker still guessing gets the same generic answer as always.
    const stillGuessing = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: newUser.email, password: 'another-wrong-guess' })
      .expect(401);
    expect(stillGuessing.body.error.code).toBe('INVALID_CREDENTIALS');

    // The real owner is told why they are being turned away.
    const owner = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .send({ email: newUser.email, password: VALID_PASSWORD })
      .expect(423);
    expect(owner.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('GET /auth/me', () => {
  it('rejects a request with no token', async () => {
    await request(ctx.app).get(ctx.api('/auth/me')).expect(401);
  });

  it('never returns the password hash or internal counters', async () => {
    await registerAndVerify(ctx.app);
    const session = await signIn(ctx.app, { email: newUser.email, password: VALID_PASSWORD });

    const res = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/passwordHash|\$argon2|failedLoginAttempts|tokenVersion|lockUntil/);
    expect(res.body.data.user.email).toBe(newUser.email);
  });
});

describe('PATCH /auth/me', () => {
  it('ignores privilege fields by rejecting unknown keys outright', async () => {
    await registerAndVerify(ctx.app);
    const session = await signIn(ctx.app, { email: newUser.email, password: VALID_PASSWORD });

    await request(ctx.app)
      .patch(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ name: 'Aarav S.', role: 'ADMIN', isEmailVerified: true })
      .expect(400);

    const after = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    expect(after.body.data.user.role).toBe('STUDENT');
  });
});
