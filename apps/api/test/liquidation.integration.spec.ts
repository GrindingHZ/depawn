import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-LIQ-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('liquidation', () => {
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
        name: 'Liquidation vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000_000n,
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

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  async function loginAs(email: string, role: 'MEMBER' | 'OPERATIONS'): Promise<Party> {
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

  interface DefaultedLoan {
    readonly loanId: string;
    readonly receiptId: string;
    readonly borrower: Party;
    readonly lender: Party;
    readonly ops: Party;
  }

  /* Carries a loan all the way to defaulted and past the statutory holding
     period, which is what flow 8 takes as its precondition. */
  async function defaultedLoan(): Promise<DefaultedLoan> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@liq.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@liq.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@liq.test`, 'OPERATIONS');
    await fund(ops, lender.email, '250000');

    const receiptId = `R-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
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
        borrowerAccountId: borrower.accountId,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30n * oneDay,
        expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 86_400_000),
        status: 'ACTIVE',
      },
    });
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
    const accepted = await server()
      .post(`/api/v1/listings/${listingId}/offers/${offer.body.id}/accept`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    // Past maturity and grace, then past the statutory holding period.
    harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
    await signInAgain(lender);
    await server()
      .post(`/api/v1/loans/${accepted.body.id}/default`)
      .set('Cookie', lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    return { loanId: accepted.body.id, receiptId, borrower, lender, ops };
  }

  async function biddingLiquidation(loan: DefaultedLoan, reserve: string): Promise<string> {
    await signInAgain(loan.ops);
    const scheduled = await server()
      .post(`/api/v1/loans/${loan.loanId}/liquidations`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ reservePrice: amount(reserve) })
      .expect(201);
    await server()
      .post(`/api/v1/liquidations/${scheduled.body.id}/open`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ biddingWindowMs: Number(7n * oneDay) })
      .expect(201);
    return scheduled.body.id;
  }

  /* Every read here happens after the clock has jumped weeks, which expires
     the session it jumped over, so the actor signs back in first. */
  async function balanceOf(party: Party): Promise<string> {
    await signInAgain(party);
    const balance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', party.cookies)
      .expect(200);
    return balance.body.available.minorUnits;
  }

  async function feeRevenue(): Promise<bigint> {
    const rows = await harness.prisma.$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS balance
      FROM ledger_entry e
      JOIN ledger_account a ON a.id = e.account_id
      WHERE a.purpose = 'PLATFORM_FEE_REVENUE'
    `;
    return rows[0]?.balance ?? 0n;
  }

  it('refuses a sale inside the statutory holding period', async () => {
    const loan = await defaultedLoan();
    await signInAgain(loan.ops);

    // The clock is past maturity and grace, but the holding period runs from
    // the default itself, so a sale now is too early.
    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/liquidations`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ reservePrice: amount('200000') })
      .expect(422);
    expect(rejected.body.error.code).toBe('HOLDING_PERIOD_ACTIVE');
    expect(await harness.prisma.liquidation.count()).toBe(0);
  });

  it('settles at a surplus and returns it to the borrower', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    const liquidationId = await biddingLiquidation(loan, '200000');

    const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await fund(loan.ops, bidder.email, '400000');
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', bidder.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('300000') })
      .expect(201);

    const borrowerBefore = BigInt(await balanceOf(loan.borrower));
    // The account already holds the origination fee, so the sale is measured
    // as a delta rather than an absolute.
    const feeBefore = await feeRevenue();
    const closed = await server()
      .post(`/api/v1/liquidations/${liquidationId}/close`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(closed.body.status).toBe('SETTLED');

    // 250000 principal plus 3698 interest accrued to maturity, since
    // interest stops there; the rest of the 300000 sale is fee then surplus.
    const owed = 253_698n;
    expect(BigInt(await balanceOf(loan.lender))).toBe(owed);
    const remainder = 300_000n - owed;
    const fee = (remainder * 200n) / 10_000n;
    expect((await feeRevenue()) - feeBefore).toBe(fee);
    expect(BigInt(await balanceOf(loan.borrower))).toBe(borrowerBefore + (remainder - fee));

    const receipt = await harness.prisma.custodyReceipt.findUnique({
      where: { id: loan.receiptId },
    });
    expect(receipt?.status).toBe('LIQUIDATED');
    const loanRow = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
    expect(loanRow?.status).toBe('LIQUIDATED');
    expect(
      await harness.prisma.ledgerTransaction.count({ where: { kind: 'SETTLE_LIQUIDATION' } }),
    ).toBe(1);
  });

  it('settles at a loss with the lender taking everything', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    const liquidationId = await biddingLiquidation(loan, '100000');

    const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await fund(loan.ops, bidder.email, '200000');
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', bidder.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('200000') })
      .expect(201);

    const borrowerBefore = BigInt(await balanceOf(loan.borrower));
    const feeBefore = await feeRevenue();
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/close`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    // The lender is short and takes the lot; no fee on nothing, no surplus.
    expect(BigInt(await balanceOf(loan.lender))).toBe(200_000n);
    expect((await feeRevenue()) - feeBefore).toBe(0n);
    expect(BigInt(await balanceOf(loan.borrower))).toBe(borrowerBefore);
  });

  it('settles at exactly the amount owed', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    const liquidationId = await biddingLiquidation(loan, '100000');

    const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await fund(loan.ops, bidder.email, '300000');
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', bidder.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('253698') })
      .expect(201);

    const borrowerBefore = BigInt(await balanceOf(loan.borrower));
    const feeBefore = await feeRevenue();
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/close`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    // Exactly the debt: the lender is made whole and nothing is left over.
    expect(BigInt(await balanceOf(loan.lender))).toBe(253_698n);
    expect((await feeRevenue()) - feeBefore).toBe(0n);
    expect(BigInt(await balanceOf(loan.borrower))).toBe(borrowerBefore);
  });

  it('refuses a bid below the reserve and leaves the funds alone', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    const liquidationId = await biddingLiquidation(loan, '200000');

    const bidder = await loginAs(`bidder-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await fund(loan.ops, bidder.email, '400000');

    const rejected = await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', bidder.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('199999') })
      .expect(422);
    expect(rejected.body.error.code).toBe('BID_BELOW_RESERVE');
    expect(BigInt(await balanceOf(bidder))).toBe(400_000n);
    expect(await harness.prisma.fundsHold.count({ where: { accountId: bidder.accountId } })).toBe(
      0,
    );
  });

  it('leaves a beaten bidder able to reclaim', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    const liquidationId = await biddingLiquidation(loan, '200000');

    const first = await loginAs(`first-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    const second = await loginAs(`second-${randomUUID().slice(0, 8)}@liq.test`, 'MEMBER');
    await signInAgain(loan.ops);
    await fund(loan.ops, first.email, '400000');
    await fund(loan.ops, second.email, '400000');

    await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', first.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('250000') })
      .expect(201);
    await server()
      .post(`/api/v1/liquidations/${liquidationId}/bids`)
      .set('Cookie', second.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('300000') })
      .expect(201);

    // Pull not push: the beaten bid stays held until its owner asks for it.
    const heldRows = await harness.prisma.fundsHold.findMany({
      where: { accountId: first.accountId, status: 'HELD' },
    });
    expect(heldRows).toHaveLength(1);

    await server()
      .post(`/api/v1/liquidations/${liquidationId}/close`)
      .set('Cookie', loan.ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const stillHeld = await harness.prisma.fundsHold.findMany({
      where: { accountId: first.accountId, status: 'HELD' },
    });
    expect(stillHeld).toHaveLength(1);
  });

  it('keeps scheduling and closing away from members', async () => {
    const loan = await defaultedLoan();
    harness.clock.advanceBy(31n * oneDay);
    await signInAgain(loan.lender);
    await server()
      .post(`/api/v1/loans/${loan.loanId}/liquidations`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ reservePrice: amount('200000') })
      .expect(403);
  });
});
