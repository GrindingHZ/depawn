import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-MKT-1';
const password = 'a-long-enough-password';
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('marketplace', () => {
  let harness: TestApplication;

  beforeAll(async () => {
    harness = await createTestApplication();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Marketplace vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'AUD',
      },
    });
  });

  afterEach(async () => {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'VAULT_STAFF' | 'OPERATIONS',
  ): Promise<string[]> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  async function fundedLender(email: string, minorUnits: string): Promise<string[]> {
    const cookies = await loginAs(email, 'MEMBER');
    const opsCookies = await loginAs(`ops-${email}`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', opsCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
    return cookies;
  }

  async function issuedReceiptFor(borrowerEmail: string): Promise<string> {
    const account = await harness.prisma.account.findUnique({ where: { email: borrowerEmail } });
    if (account === null) {
      throw new Error('borrower must be registered first');
    }
    const suffix = randomUUID().slice(0, 8);
    await harness.prisma.custodyReceipt.create({
      data: {
        id: `R-${suffix}`,
        vaultId,
        holderAccountId: account.id,
        intakeRecordHash: `hash-${suffix}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    return `R-${suffix}`;
  }

  const inAnHour = new Date(Date.now() + 3_600_000_000).toISOString();

  async function publishedListing(borrowerCookies: string[], receiptId: string): Promise<string> {
    const created = await server()
      .post('/api/v1/listings')
      .set('Cookie', borrowerCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        receiptId,
        requestedPrincipal: amount('250000'),
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(201);
    await server()
      .post(`/api/v1/listings/${created.body.id}/publish`)
      .set('Cookie', borrowerCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    return created.body.id;
  }

  it('lists, publishes, takes a funded offer, and shows the ranked book', async () => {
    const borrowerCookies = await loginAs('borrower@mkt.test', 'MEMBER');
    const receiptId = await issuedReceiptFor('borrower@mkt.test');
    const lenderCookies = await fundedLender('lender@mkt.test', '300000');
    const listingId = await publishedListing(borrowerCookies, receiptId);

    const overLtv = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('300001'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(422);
    expect(overLtv.body.error.code).toBe('LOAN_TO_VALUE_EXCEEDED');

    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(201);
    expect(offer.body.status).toBe('PENDING');

    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', lenderCookies)
      .expect(200);
    expect(balance.body.available).toEqual(amount('50000'));
    expect(balance.body.held).toEqual(amount('250000'));

    const detail = await server().get(`/api/v1/listings/${listingId}`).expect(200);
    expect(detail.body.offerBook).toHaveLength(1);
    expect(detail.body.maxPrincipal).toEqual(amount('300000'));

    const browse = await server().get('/api/v1/listings').expect(200);
    expect(browse.body.items.map((item: { id: string }) => item.id)).toContain(listingId);
  });

  it('rejects an offer beyond the available balance', async () => {
    const borrowerCookies = await loginAs('borrower@mkt.test', 'MEMBER');
    const receiptId = await issuedReceiptFor('borrower@mkt.test');
    const lenderCookies = await fundedLender('lender@mkt.test', '100000');
    const listingId = await publishedListing(borrowerCookies, receiptId);

    const rejected = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(422);
    expect(rejected.body.error.code).toBe('INSUFFICIENT_FUNDS');
    expect(await harness.prisma.offer.count()).toBe(0);
    expect(await harness.prisma.fundsHold.count()).toBe(0);
  });

  it('withdraws after the minimum lifetime and refunds the hold', async () => {
    const borrowerCookies = await loginAs('borrower@mkt.test', 'MEMBER');
    const receiptId = await issuedReceiptFor('borrower@mkt.test');
    const lenderCookies = await fundedLender('lender@mkt.test', '250000');
    const listingId = await publishedListing(borrowerCookies, receiptId);

    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(201);

    const early = await server()
      .post(`/api/v1/listings/${listingId}/offers/${offer.body.id}/withdraw`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(early.body.error.code).toBe('OFFER_WITHDRAWAL_TOO_EARLY');

    harness.clock.advanceBy(700_000n);
    await server()
      .post(`/api/v1/listings/${listingId}/offers/${offer.body.id}/withdraw`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', lenderCookies)
      .expect(200);
    expect(balance.body.available).toEqual(amount('250000'));
    expect(balance.body.held).toEqual(amount('0'));
  });

  it('cancellation supersedes offers and the lender reclaims once', async () => {
    const borrowerCookies = await loginAs('borrower@mkt.test', 'MEMBER');
    const receiptId = await issuedReceiptFor('borrower@mkt.test');
    const lenderCookies = await fundedLender('lender@mkt.test', '250000');
    const listingId = await publishedListing(borrowerCookies, receiptId);

    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(201);

    await server()
      .post(`/api/v1/listings/${listingId}/cancel`)
      .set('Cookie', borrowerCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const offers = await server().get('/api/v1/me/offers').set('Cookie', lenderCookies).expect(200);
    expect(offers.body.items[0].status).toBe('SUPERSEDED');

    // The hold is still committed until the lender reclaims (rule M8).
    const heldBefore = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', lenderCookies)
      .expect(200);
    expect(heldBefore.body.held).toEqual(amount('250000'));

    const first = await server()
      .post(`/api/v1/me/offers/${offer.body.id}/reclaim`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const second = await server()
      .post(`/api/v1/me/offers/${offer.body.id}/reclaim`)
      .set('Cookie', lenderCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(second.body.settlementRef.reference).toBe(first.body.settlementRef.reference);
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'REFUND_HOLD' } })).toBe(
      1,
    );

    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', lenderCookies)
      .expect(200);
    expect(balance.body.available).toEqual(amount('250000'));
  });

  it('rejects a second live listing on the same receipt', async () => {
    const borrowerCookies = await loginAs('borrower@mkt.test', 'MEMBER');
    const receiptId = await issuedReceiptFor('borrower@mkt.test');
    await publishedListing(borrowerCookies, receiptId);

    const duplicate = await server()
      .post('/api/v1/listings')
      .set('Cookie', borrowerCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        receiptId,
        requestedPrincipal: amount('100000'),
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(409);
    expect(duplicate.body.error.code).toBe('RECEIPT_ALREADY_LISTED');
  });
});
