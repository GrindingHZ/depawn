import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

describe('auth', () => {
  let harness: TestApplication;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
  });

  const credentials = { email: 'borrower@example.test', password: 'a-long-enough-password' };

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  it('registers a member account', async () => {
    const response = await server().post('/api/v1/auth/register').send(credentials).expect(201);
    expect(response.body.email).toBe(credentials.email);
    expect(response.body.roles).toEqual(['MEMBER']);
    expect(response.body.id).toBeTruthy();
  });

  it('rejects a duplicate registration with a stable code', async () => {
    await server().post('/api/v1/auth/register').send(credentials).expect(201);
    const response = await server().post('/api/v1/auth/register').send(credentials).expect(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a malformed registration body', async () => {
    const response = await server()
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('logs in with a session cookie and reads me', async () => {
    await server().post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await server().post('/api/v1/auth/login').send(credentials).expect(200);

    const cookies = login.get('Set-Cookie') ?? [];
    expect(cookies.some((cookie) => cookie.startsWith('depawn_session='))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((cookie) => cookie.includes('SameSite=Strict'))).toBe(true);

    const me = await server().get('/api/v1/me').set('Cookie', cookies).expect(200);
    expect(me.body.email).toBe(credentials.email);
  });

  it('rejects a wrong password with the unauthenticated code', async () => {
    await server().post('/api/v1/auth/register').send(credentials).expect(201);
    const response = await server()
      .post('/api/v1/auth/login')
      .send({ ...credentials, password: 'wrong-password-entirely' })
      .expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects me without a session', async () => {
    const response = await server().get('/api/v1/me').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('revokes the session on logout', async () => {
    await server().post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await server().post('/api/v1/auth/login').send(credentials).expect(200);
    const cookies = login.get('Set-Cookie') ?? [];

    await server().post('/api/v1/auth/logout').set('Cookie', cookies).expect(204);
    await server().get('/api/v1/me').set('Cookie', cookies).expect(401);
  });

  it('rejects an expired session', async () => {
    await server().post('/api/v1/auth/register').send(credentials).expect(201);
    const login = await server().post('/api/v1/auth/login').send(credentials).expect(200);
    const cookies = login.get('Set-Cookie') ?? [];

    harness.clock.advanceBy(8n * 24n * 60n * 60n * 1000n);
    await server().get('/api/v1/me').set('Cookie', cookies).expect(401);
  });
});
