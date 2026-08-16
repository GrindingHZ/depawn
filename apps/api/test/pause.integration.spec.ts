import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-PAUSE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

/* Rule S2 is the reason this file exists. A pause that traps a borrower's
   collateral or a lender's principal is itself an attack surface, so every
   exit path gets its own assertion rather than one loop over a list
   (docs/10-flows.md flow 11). */
describe('pause', () => {
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
        name: 'Pause vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000_000n,
        currency: 'AUD',
      },
    });
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'OPERATIONS' | 'VAULT_STAFF',
  ): Promise<Party> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    const account = await harness.prisma.account.findUnique({ where: { email } });
    if (account === null) {
      throw new Error('registration must create the account');
    }
    return { cookies: login.get('Set-Cookie') ?? [], accountId: account.id, email };
  }

  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  async function fund(ops: Party, email: string, minorUnits: string): Promise<void> {
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
  }

  async function pauseSystem(ops: Party): Promise<void> {
    await signInAgain(ops);
    const paused = await server()
      .post('/api/v1/admin/pause')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'A ledger discrepancy is under investigation.' })
      .expect(201);
    expect(paused.body.isPaused).toBe(true);
  }

  async function receiptFor(holderAccountId: string): Promise<string> {
    const suffix = randomUUID().slice(0, 8);
    const receiptId = `R-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId,
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
    return receiptId;
  }

  async function activeListing(borrowerAccountId: string, receiptId: string): Promise<string> {
    const listingId = `L-${randomUUID().slice(0, 8)}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30n * oneDay,
        expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 86_400_000),
        status: 'ACTIVE',
      },
    });
    return listingId;
  }

  async function placeOffer(listingId: string, lender: Party): Promise<string> {
    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: 1800,
        durationMs: Number(30n * oneDay),
        expiresAt: new Date(
          Number(harness.clock.now().epochMilliseconds) + 3_600_000,
        ).toISOString(),
      })
      .expect(201);
    return offer.body.id;
  }

  describe('blocks new business', () => {
    it('refuses to create a listing', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      const receiptId = await receiptFor(borrower.accountId);
      await pauseSystem(ops);

      await signInAgain(borrower);
      const rejected = await server()
        .post('/api/v1/listings')
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({
          receiptId,
          requestedPrincipal: amount('250000'),
          maxAnnualPercentageRateBasisPoints: 2400,
          requestedDurationMs: Number(30n * oneDay),
          requestedLifetimeMs: 3_600_000,
        })
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
      expect(await harness.prisma.listing.count()).toBe(0);
    });

    it('refuses to publish a listing', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      const receiptId = await receiptFor(borrower.accountId);
      const created = await server()
        .post('/api/v1/listings')
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({
          receiptId,
          requestedPrincipal: amount('250000'),
          maxAnnualPercentageRateBasisPoints: 2400,
          requestedDurationMs: Number(30n * oneDay),
          requestedLifetimeMs: 3_600_000,
        })
        .expect(201);
      await pauseSystem(ops);

      await signInAgain(borrower);
      const rejected = await server()
        .post(`/api/v1/listings/${created.body.id}/publish`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
    });

    it('refuses to place an offer', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const lender = await loginAs('lender@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      await pauseSystem(ops);

      await signInAgain(lender);
      const rejected = await server()
        .post(`/api/v1/listings/${listingId}/offers`)
        .set('Cookie', lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({
          principal: amount('250000'),
          annualPercentageRateBasisPoints: 1800,
          durationMs: Number(30n * oneDay),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
      // No hold was taken, so the lender keeps the money available.
      expect(await harness.prisma.fundsHold.count()).toBe(0);
    });

    it('refuses to accept an offer', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const lender = await loginAs('lender@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      const offerId = await placeOffer(listingId, lender);
      await pauseSystem(ops);

      await signInAgain(borrower);
      const rejected = await server()
        .post(`/api/v1/listings/${listingId}/offers/${offerId}/accept`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
      expect(await harness.prisma.loan.count()).toBe(0);
    });
  });

  describe('blocks a sale that has not opened', () => {
    /* Reaching a scheduled sale takes a whole loan lifecycle, so the setup is
       shared while each blocked entrance keeps its own assertion. */
    async function scheduledSale(): Promise<{ liquidationId: string; ops: Party }> {
      const suffix = randomUUID().slice(0, 8);
      const borrower = await loginAs(`borrower-${suffix}@pause.test`, 'MEMBER');
      const lender = await loginAs(`lender-${suffix}@pause.test`, 'MEMBER');
      const ops = await loginAs(`ops-${suffix}@pause.test`, 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      const offerId = await placeOffer(listingId, lender);
      const accepted = await server()
        .post(`/api/v1/listings/${listingId}/offers/${offerId}/accept`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);

      harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
      await signInAgain(lender);
      await server()
        .post(`/api/v1/loans/${accepted.body.id}/default`)
        .set('Cookie', lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      harness.clock.advanceBy(31n * oneDay);
      await signInAgain(ops);
      const scheduled = await server()
        .post(`/api/v1/loans/${accepted.body.id}/liquidations`)
        .set('Cookie', ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ reservePrice: amount('200000') })
        .expect(201);
      return { liquidationId: scheduled.body.id, ops };
    }

    it('refuses to open a liquidation', async () => {
      const sale = await scheduledSale();
      await pauseSystem(sale.ops);

      const rejected = await server()
        .post(`/api/v1/liquidations/${sale.liquidationId}/open`)
        .set('Cookie', sale.ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ biddingWindowMs: Number(7n * oneDay) })
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
      const row = await harness.prisma.liquidation.findUnique({
        where: { id: sale.liquidationId },
      });
      expect(row?.status).toBe('SCHEDULED');
    });

    it('refuses to bid on a sale', async () => {
      const sale = await scheduledSale();
      await server()
        .post(`/api/v1/liquidations/${sale.liquidationId}/open`)
        .set('Cookie', sale.ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ biddingWindowMs: Number(7n * oneDay) })
        .expect(201);
      const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@pause.test`, 'MEMBER');
      await fund(sale.ops, bidder.email, '300000');
      await pauseSystem(sale.ops);

      await signInAgain(bidder);
      const rejected = await server()
        .post(`/api/v1/liquidations/${sale.liquidationId}/bids`)
        .set('Cookie', bidder.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: amount('300000') })
        .expect(422);
      expect(rejected.body.error.code).toBe('SYSTEM_PAUSED');
      expect(await harness.prisma.liquidationBid.count()).toBe(0);
    });
  });

  describe('never blocks an exit', () => {
    interface LiveLoan {
      readonly loanId: string;
      readonly receiptId: string;
      readonly listingId: string;
      readonly borrower: Party;
      readonly lender: Party;
      readonly ops: Party;
    }

    async function liveLoan(): Promise<LiveLoan> {
      const suffix = randomUUID().slice(0, 8);
      const borrower = await loginAs(`borrower-${suffix}@pause.test`, 'MEMBER');
      const lender = await loginAs(`lender-${suffix}@pause.test`, 'MEMBER');
      const ops = await loginAs(`ops-${suffix}@pause.test`, 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      await fund(ops, borrower.email, '50000');

      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      const offerId = await placeOffer(listingId, lender);
      const accepted = await server()
        .post(`/api/v1/listings/${listingId}/offers/${offerId}/accept`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      return { loanId: accepted.body.id, receiptId, listingId, borrower, lender, ops };
    }

    it('lets a borrower repay', async () => {
      const loan = await liveLoan();
      await pauseSystem(loan.ops);

      await signInAgain(loan.borrower);
      const quote = await server()
        .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
        .set('Cookie', loan.borrower.cookies)
        .expect(200);
      await server()
        .post(`/api/v1/loans/${loan.loanId}/repay`)
        .set('Cookie', loan.borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
        .expect(201);
      const row = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
      expect(row?.status).toBe('REPAID');
    });

    it('lets a borrower request a redemption', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      const receiptId = await receiptFor(borrower.accountId);
      await pauseSystem(ops);

      await signInAgain(borrower);
      const requested = await server()
        .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      expect(requested.body.status).toBe('REQUESTED');
    });

    async function requestedRedemption(): Promise<{ requestId: string; staff: Party; ops: Party }> {
      const suffix = randomUUID().slice(0, 8);
      const borrower = await loginAs(`borrower-${suffix}@pause.test`, 'MEMBER');
      const staff = await loginAs(`staff-${suffix}@pause.test`, 'VAULT_STAFF');
      const ops = await loginAs(`ops-${suffix}@pause.test`, 'OPERATIONS');
      const receiptId = await receiptFor(borrower.accountId);
      const requested = await server()
        .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      return { requestId: requested.body.id, staff, ops };
    }

    it('lets staff verify a redemption', async () => {
      const redemption = await requestedRedemption();
      await pauseSystem(redemption.ops);

      await signInAgain(redemption.staff);
      const verified = await server()
        .post(`/api/v1/redemption-requests/${redemption.requestId}/verify`)
        .set('Cookie', redemption.staff.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      expect(verified.body.status).toBe('VERIFIED');
    });

    it('lets staff release a verified redemption', async () => {
      const redemption = await requestedRedemption();
      await server()
        .post(`/api/v1/redemption-requests/${redemption.requestId}/verify`)
        .set('Cookie', redemption.staff.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      await pauseSystem(redemption.ops);

      await signInAgain(redemption.staff);
      const released = await server()
        .post(`/api/v1/redemption-requests/${redemption.requestId}/release`)
        .set('Cookie', redemption.staff.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ sealNumberBroken: 'SEAL-9' })
        .expect(201);
      expect(released.body.status).toBe('RELEASED');
    });

    it('lets a lender withdraw an offer', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const lender = await loginAs('lender@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      const offerId = await placeOffer(listingId, lender);
      await pauseSystem(ops);

      harness.clock.advanceBy(700_000n);
      await signInAgain(lender);
      await server()
        .post(`/api/v1/listings/${listingId}/offers/${offerId}/withdraw`)
        .set('Cookie', lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      const balance = await server()
        .get('/api/v1/me/balance')
        .set('Cookie', lender.cookies)
        .expect(200);
      expect(balance.body.available).toEqual(amount('250000'));
    });

    it('lets a lender reclaim a superseded hold', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const lender = await loginAs('lender@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      await fund(ops, lender.email, '250000');
      const receiptId = await receiptFor(borrower.accountId);
      const listingId = await activeListing(borrower.accountId, receiptId);
      const offerId = await placeOffer(listingId, lender);
      await server()
        .post(`/api/v1/listings/${listingId}/cancel`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      await pauseSystem(ops);

      await signInAgain(lender);
      await server()
        .post(`/api/v1/me/offers/${offerId}/reclaim`)
        .set('Cookie', lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      const balance = await server()
        .get('/api/v1/me/balance')
        .set('Cookie', lender.cookies)
        .expect(200);
      expect(balance.body.available).toEqual(amount('250000'));
    });

    it('lets a note holder mark a default', async () => {
      const loan = await liveLoan();
      harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
      await pauseSystem(loan.ops);

      await signInAgain(loan.lender);
      const defaulted = await server()
        .post(`/api/v1/loans/${loan.loanId}/default`)
        .set('Cookie', loan.lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      expect(defaulted.body.status).toBe('DEFAULTED');
    });

    it('lets a note holder claim the receipt', async () => {
      const loan = await liveLoan();
      harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
      await signInAgain(loan.lender);
      await server()
        .post(`/api/v1/loans/${loan.loanId}/default`)
        .set('Cookie', loan.lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      await pauseSystem(loan.ops);

      await signInAgain(loan.lender);
      await server()
        .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
        .set('Cookie', loan.lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      const receipt = await harness.prisma.custodyReceipt.findUnique({
        where: { id: loan.receiptId },
      });
      expect(receipt?.holderAccountId).toBe(loan.lender.accountId);
    });

    it('lets operations close a sale that is already open', async () => {
      const loan = await liveLoan();
      harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
      await signInAgain(loan.lender);
      await server()
        .post(`/api/v1/loans/${loan.loanId}/default`)
        .set('Cookie', loan.lender.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      harness.clock.advanceBy(31n * oneDay);

      await signInAgain(loan.ops);
      const scheduled = await server()
        .post(`/api/v1/loans/${loan.loanId}/liquidations`)
        .set('Cookie', loan.ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ reservePrice: amount('200000') })
        .expect(201);
      await server()
        .post(`/api/v1/liquidations/${scheduled.body.id}/open`)
        .set('Cookie', loan.ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ biddingWindowMs: Number(7n * oneDay) })
        .expect(201);
      const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@pause.test`, 'MEMBER');
      await fund(loan.ops, bidder.email, '300000');
      await server()
        .post(`/api/v1/liquidations/${scheduled.body.id}/bids`)
        .set('Cookie', bidder.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ amount: amount('300000') })
        .expect(201);

      await pauseSystem(loan.ops);

      // A sale already taking bids must be able to finish: stopping it half
      // way would strand the bidder's money and the borrower's item.
      const closed = await server()
        .post(`/api/v1/liquidations/${scheduled.body.id}/close`)
        .set('Cookie', loan.ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      expect(closed.body.status).toBe('SETTLED');
    });
  });

  describe('the switch itself', () => {
    it('refuses the switch to anyone but operations', async () => {
      const member = await loginAs('member@pause.test', 'MEMBER');
      await server()
        .post('/api/v1/admin/pause')
        .set('Cookie', member.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'I would like everyone to stop.' })
        .expect(403);
    });

    it('reports the pause to anyone signed in, with the reason', async () => {
      const member = await loginAs('member@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      await pauseSystem(ops);

      await signInAgain(member);
      const state = await server()
        .get('/api/v1/admin/system-state')
        .set('Cookie', member.cookies)
        .expect(200);
      expect(state.body.isPaused).toBe(true);
      expect(state.body.reason).toBe('A ledger discrepancy is under investigation.');
      expect(state.body.pausedByAccountId).toBe(ops.accountId);
    });

    it('resumes business when unpaused', async () => {
      const borrower = await loginAs('borrower@pause.test', 'MEMBER');
      const ops = await loginAs('ops@pause.test', 'OPERATIONS');
      const receiptId = await receiptFor(borrower.accountId);
      await pauseSystem(ops);
      await server()
        .post('/api/v1/admin/unpause')
        .set('Cookie', ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);

      await signInAgain(borrower);
      await server()
        .post('/api/v1/listings')
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({
          receiptId,
          requestedPrincipal: amount('250000'),
          maxAnnualPercentageRateBasisPoints: 2400,
          requestedDurationMs: Number(30n * oneDay),
          requestedLifetimeMs: 3_600_000,
        })
        .expect(201);

      const audits = await harness.prisma.auditLog.findMany({
        where: { subjectType: 'system' },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audits.map((entry) => entry.action)).toEqual(['pause_system', 'unpause_system']);
    });
  });
});
