import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

describe('wallet', () => {
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

  afterEach(async () => {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  const password = 'a-long-enough-password';

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function registerAndLogin(email: string): Promise<string[]> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  async function loginAsOperations(): Promise<string[]> {
    const email = 'ops@wallet.test';
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    await harness.prisma.account.update({ where: { email }, data: { roles: ['OPERATIONS'] } });
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  const amount = (minorUnits: string): { minorUnits: string; currency: string } => ({
    minorUnits,
    currency: 'AUD',
  });

  it('deposits into a named account and the member sees the balance', async () => {
    const memberCookies = await registerAndLogin('member@wallet.test');
    const opsCookies = await loginAsOperations();

    const deposit = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'member@wallet.test', amount: amount('250000') })
      .expect(201);
    expect(deposit.body.settlementRef.kind).toBe('ledger');
    expect(deposit.body.settlementRef.reference).toBeTruthy();

    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', memberCookies)
      .expect(200);
    expect(balance.body.available).toEqual(amount('250000'));
    expect(balance.body.held).toEqual(amount('0'));

    const entries = await server()
      .get('/api/v1/me/ledger-entries')
      .set('Cookie', memberCookies)
      .expect(200);
    expect(entries.body.items).toHaveLength(1);
    expect(entries.body.items[0].kind).toBe('DEPOSIT');
    expect(entries.body.items[0].direction).toBe('CREDIT');
  });

  it('rejects a deposit from a member', async () => {
    const memberCookies = await registerAndLogin('member2@wallet.test');
    const response = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', memberCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('1000') })
      .expect(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
  });

  it('rejects a deposit to an unknown email', async () => {
    const opsCookies = await loginAsOperations();
    const response = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'nobody@wallet.test', amount: amount('1000') })
      .expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('withdraws within the balance and rejects beyond it', async () => {
    const memberCookies = await registerAndLogin('member3@wallet.test');
    const opsCookies = await loginAsOperations();
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'member3@wallet.test', amount: amount('10000') })
      .expect(201);

    await server()
      .post('/api/v1/me/withdrawals')
      .set('Cookie', memberCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('4000') })
      .expect(201);

    const rejected = await server()
      .post('/api/v1/me/withdrawals')
      .set('Cookie', memberCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('7000') })
      .expect(422);
    expect(rejected.body.error.code).toBe('INSUFFICIENT_FUNDS');

    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', memberCookies)
      .expect(200);
    expect(balance.body.available).toEqual(amount('6000'));
  });

  it('replays a duplicate deposit instead of moving money twice', async () => {
    await registerAndLogin('member4@wallet.test');
    const opsCookies = await loginAsOperations();
    const key = randomUUID();
    const body = { email: 'member4@wallet.test', amount: amount('5000') };

    const first = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    const second = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);

    expect(second.body).toEqual(first.body);
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'DEPOSIT' } })).toBe(1);
  });

  it('moves money once when the same key races itself', async () => {
    await registerAndLogin('member7@wallet.test');
    const opsCookies = await loginAsOperations();
    const key = randomUUID();
    const body = { email: 'member7@wallet.test', amount: amount('5000') };

    const send = (): Promise<request.Response> =>
      server()
        .post('/api/v1/me/deposits')
        .set('Cookie', opsCookies)
        .set('Idempotency-Key', key)
        .send(body)
        .then((response) => response);

    const responses = await Promise.all([send(), send()]);
    // Two legal outcomes: the loser hits the pending claim (409), or arrives
    // after completion and replays the stored 201. Either way the money moved
    // exactly once.
    const statuses = responses.map((response) => response.status).sort();
    expect([
      [201, 409],
      [201, 201],
    ]).toContainEqual(statuses);
    if (statuses[1] === 201) {
      expect(responses[1]?.body).toEqual(responses[0]?.body);
    }
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'DEPOSIT' } })).toBe(1);
  });

  it('rejects the same key with a different payload', async () => {
    await registerAndLogin('member5@wallet.test');
    const opsCookies = await loginAsOperations();
    const key = randomUUID();

    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', key)
      .send({ email: 'member5@wallet.test', amount: amount('5000') })
      .expect(201);
    const reused = await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', key)
      .send({ email: 'member5@wallet.test', amount: amount('9000') })
      .expect(409);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('paginates ledger entries with a cursor', async () => {
    const memberCookies = await registerAndLogin('member6@wallet.test');
    const opsCookies = await loginAsOperations();
    for (let index = 0; index < 3; index += 1) {
      await server()
        .post('/api/v1/me/deposits')
        .set('Cookie', opsCookies)
        .set('Idempotency-Key', randomUUID())
        .send({ email: 'member6@wallet.test', amount: amount('1000') })
        .expect(201);
    }

    const firstPage = await server()
      .get('/api/v1/me/ledger-entries?limit=2')
      .set('Cookie', memberCookies)
      .expect(200);
    expect(firstPage.body.items).toHaveLength(2);
    expect(firstPage.body.nextCursor).not.toBeNull();

    const secondPage = await server()
      .get(`/api/v1/me/ledger-entries?limit=2&cursor=${firstPage.body.nextCursor}`)
      .set('Cookie', memberCookies)
      .expect(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.nextCursor).toBeNull();
  });
});
