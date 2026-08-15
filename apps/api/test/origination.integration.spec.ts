import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-ORIG-1';
const password = 'a-long-enough-password';
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('origination', () => {
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
        name: 'Origination vault',
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
    role: 'MEMBER' | 'OPERATIONS',
  ): Promise<{ cookies: string[]; accountId: string }> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUnique({ where: { email } });
    if (account === null) {
      throw new Error('registration must create the account');
    }
    return { cookies: login.get('Set-Cookie') ?? [], accountId: account.id };
  }

  async function fundedLender(
    email: string,
    minorUnits: string,
  ): Promise<{ cookies: string[]; accountId: string }> {
    const lender = await loginAs(email, 'MEMBER');
    const ops = await loginAs(`ops-${email}`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
    return lender;
  }

  const inAnHour = new Date(Date.now() + 3_600_000_000).toISOString();

  async function activeListing(borrowerAccountId: string): Promise<{
    listingId: string;
    receiptId: string;
  }> {
    const suffix = randomUUID().slice(0, 8);
    const receiptId = `R-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrowerAccountId,
        intakeRecordHash: `hash-${suffix}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-${suffix}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 2_592_000_000n,
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'ACTIVE',
      },
    });
    return { listingId, receiptId };
  }

  async function placedOffer(
    listingId: string,
    cookies: string[],
    rateBasisPoints: number,
  ): Promise<string> {
    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: rateBasisPoints,
        durationMs: 2_592_000_000,
        expiresAt: inAnHour,
      })
      .expect(201);
    return offer.body.id;
  }

  it('originates a loan, splits the fee, and leaves losers reclaimable', async () => {
    const borrower = await loginAs('borrower@orig.test', 'MEMBER');
    const winner = await fundedLender('winner@orig.test', '250000');
    const loser = await fundedLender('loser@orig.test', '250000');
    const { listingId, receiptId } = await activeListing(borrower.accountId);
    const winningOfferId = await placedOffer(listingId, winner.cookies, 1800);
    const losingOfferId = await placedOffer(listingId, loser.cookies, 2400);

    const accepted = await server()
      .post(`/api/v1/listings/${listingId}/offers/${winningOfferId}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    expect(accepted.body.status).toBe('ACTIVE');
    expect(accepted.body.principal).toEqual(amount('250000'));
    expect(accepted.body.lenderNoteHolderAccountId).toBe(winner.accountId);
    expect(accepted.body.borrowerAccountId).toBe(borrower.accountId);
    expect(accepted.body.originationSettlementRef.kind).toBe('ledger');
    const startedAt = new Date(accepted.body.startedAt).getTime();
    expect(new Date(accepted.body.maturesAt).getTime()).toBe(startedAt + 2_592_000_000);
    expect(new Date(accepted.body.graceEndsAt).getTime()).toBe(
      startedAt + 2_592_000_000 + 604_800_000,
    );

    // 200 basis points of 250000 goes to the platform, the rest disburses.
    const borrowerBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', borrower.cookies)
      .expect(200);
    expect(borrowerBalance.body.available).toEqual(amount('245000'));
    const feeBalance = await harness.prisma.$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS balance
      FROM ledger_entry e
      JOIN ledger_account a ON a.id = e.account_id
      WHERE a.purpose = 'PLATFORM_FEE_REVENUE'
    `;
    expect(feeBalance[0]?.balance).toBe(5_000n);

    const receipt = await harness.prisma.custodyReceipt.findUnique({ where: { id: receiptId } });
    expect(receipt?.status).toBe('ENCUMBERED');
    expect(receipt?.encumberedByLoanId).toBe(accepted.body.id);

    const listing = await harness.prisma.listing.findUnique({ where: { id: listingId } });
    expect(listing?.status).toBe('MATCHED');
    const winnerRow = await harness.prisma.offer.findUnique({ where: { id: winningOfferId } });
    expect(winnerRow?.status).toBe('ACCEPTED');
    const loserRow = await harness.prisma.offer.findUnique({ where: { id: losingOfferId } });
    expect(loserRow?.status).toBe('SUPERSEDED');

    // Rule M8: the losing hold stays committed until the lender reclaims.
    const loserBefore = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', loser.cookies)
      .expect(200);
    expect(loserBefore.body.held).toEqual(amount('250000'));
    await server()
      .post(`/api/v1/me/offers/${losingOfferId}/reclaim`)
      .set('Cookie', loser.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const loserAfter = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', loser.cookies)
      .expect(200);
    expect(loserAfter.body.available).toEqual(amount('250000'));

    const asBorrower = await server()
      .get('/api/v1/me/loans?role=borrower')
      .set('Cookie', borrower.cookies)
      .expect(200);
    expect(asBorrower.body.items.map((item: { id: string }) => item.id)).toEqual([
      accepted.body.id,
    ]);
    const asLender = await server()
      .get('/api/v1/me/loans?role=lender')
      .set('Cookie', winner.cookies)
      .expect(200);
    expect(asLender.body.items).toHaveLength(1);
    await server()
      .get(`/api/v1/loans/${accepted.body.id}`)
      .set('Cookie', winner.cookies)
      .expect(200);
    await server()
      .get(`/api/v1/loans/${accepted.body.id}`)
      .set('Cookie', loser.cookies)
      .expect(404);
  });

  it('rejects acceptance by anyone but the borrower', async () => {
    const borrower = await loginAs('borrower@orig.test', 'MEMBER');
    const lender = await fundedLender('lender@orig.test', '250000');
    const { listingId } = await activeListing(borrower.accountId);
    const offerId = await placedOffer(listingId, lender.cookies, 1800);

    const rejected = await server()
      .post(`/api/v1/listings/${listingId}/offers/${offerId}/accept`)
      .set('Cookie', lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');
    expect(await harness.prisma.loan.count()).toBe(0);
  });

  it('rejects accepting a withdrawn offer and a matched listing', async () => {
    const borrower = await loginAs('borrower@orig.test', 'MEMBER');
    const first = await fundedLender('first@orig.test', '250000');
    const second = await fundedLender('second@orig.test', '250000');
    const { listingId } = await activeListing(borrower.accountId);
    const firstOfferId = await placedOffer(listingId, first.cookies, 1800);
    const secondOfferId = await placedOffer(listingId, second.cookies, 2000);

    harness.clock.advanceBy(700_000n);
    await server()
      .post(`/api/v1/listings/${listingId}/offers/${firstOfferId}/withdraw`)
      .set('Cookie', first.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const withdrawn = await server()
      .post(`/api/v1/listings/${listingId}/offers/${firstOfferId}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(withdrawn.body.error.code).toBe('OFFER_NOT_PENDING');

    await server()
      .post(`/api/v1/listings/${listingId}/offers/${secondOfferId}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const rematched = await server()
      .post(`/api/v1/listings/${listingId}/offers/${secondOfferId}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(rematched.body.error.code).toBe('LISTING_ALREADY_MATCHED');
    expect(await harness.prisma.loan.count()).toBe(1);
  });
});
