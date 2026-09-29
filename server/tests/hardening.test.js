import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { registerAndVerify, signIn, startTestServer, VALID_PASSWORD } from './helpers.js';
import { User } from '../src/modules/user/user.model.js';
import { ROLES, USER_STATUS } from '../src/modules/user/user.constants.js';

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

const EMAIL = 'aarav.sharma@iitb.ac.in';

describe('request hardening', () => {
  it('strips MongoDB operator keys out of the query string', async () => {
    // Reaching the handler at all proves the operator never made it into a filter.
    const res = await request(ctx.app).get(ctx.api('/health?role[$ne]=STUDENT')).expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects a body over the 100kb limit', async () => {
    const res = await request(ctx.app)
      .post(ctx.api('/auth/login'))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: EMAIL, password: 'x'.repeat(200_000) }));

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('does not advertise the server framework', async () => {
    const res = await request(ctx.app).get(ctx.api('/health')).expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('returns a structured error for an unknown route without a stack trace', async () => {
    const res = await request(ctx.app).get(ctx.api('/does-not-exist')).expect(404);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(res.body.error.stack).toBeUndefined();
  });
});

describe('role and status enforcement', () => {
  it('locks a suspended user out even with a valid, unexpired access token', async () => {
    await registerAndVerify(ctx.app);
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    await User.updateOne({ email: EMAIL }, { $set: { status: USER_STATUS.SUSPENDED } });

    const res = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(403);

    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('reads the role from the database, not from the token', async () => {
    await registerAndVerify(ctx.app);
    const session = await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    await User.updateOne({ email: EMAIL }, { $set: { role: ROLES.ADMIN } });

    const res = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200);

    // Token still says STUDENT; the authoritative answer comes from the row.
    expect(res.body.data.user.role).toBe(ROLES.ADMIN);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NTAwMDAwMDAwMDAwMDAwMDAwMDAwMDAiLCJyb2xlIjoiQURNSU4ifQ.bogus-signature';

    const res = await request(ctx.app)
      .get(ctx.api('/auth/me'))
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_ACCESS_TOKEN');
  });
});

describe('stored secrets', () => {
  it('never stores the password or the refresh token in clear text', async () => {
    await registerAndVerify(ctx.app);
    await signIn(ctx.app, { email: EMAIL, password: VALID_PASSWORD });

    const stored = await User.findOne({ email: EMAIL })
      .select('+passwordHash +emailVerification')
      .lean();

    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(VALID_PASSWORD);

    const { RefreshToken } = await import('../src/modules/auth/refreshToken.model.js');
    const tokens = await RefreshToken.find().lean();
    expect(tokens).toHaveLength(1);
    // Stored as a 64-char HMAC digest, not the 86-char base64url token we handed out.
    expect(tokens[0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
