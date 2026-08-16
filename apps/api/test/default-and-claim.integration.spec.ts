import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-DEFAULT-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const gracePeriodMs = 7n * oneDay;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('default and claim', () => {
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
        name: 'Default vault',
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

  /* Sessions expire against the same clock the grace period runs on, so a
     lender coming back after maturity signs in again. */
  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  interface OriginatedLoan {
    readonly loanId: string;
    readonly receiptId: string;
    readonly borrower: Party;
    readonly lender: Party;
  }

  async function originate(): Promise<OriginatedLoan> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@default.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@default.test`, 'MEMBER');
    const ops = await loginAs(`ops-${suffix}@default.test`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: lender.email, amount: amount('250000') })
      .expect(201);

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
        itemDescription: 'One kilogram gold bar, cast',
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
    return { loanId: accepted.body.id, receiptId, borrower, lender };
  }

  function pastGrace(): bigint {
    return 30n * oneDay + gracePeriodMs + oneDay;
  }

  it('refuses a default while the borrower is inside grace', async () => {
    const loan = await originate();
    harness.clock.advanceBy(30n * oneDay + oneDay);
    await signInAgain(loan.lender);

    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(rejected.body.error.code).toBe('GRACE_PERIOD_ACTIVE');

    const row = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.defaultedAt).toBeNull();
  });

  it('refuses a default from anyone but the note holder', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.borrower);

    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses a claim before the loan is defaulted', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);

    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(rejected.body.error.code).toBe('LOAN_NOT_DEFAULTED');

    const receipt = await harness.prisma.custodyReceipt.findUnique({
      where: { id: loan.receiptId },
    });
    expect(receipt?.status).toBe('ENCUMBERED');
  });

  it('refuses a claim on a loan the borrower repaid in time', async () => {
    const loan = await originate();
    // The borrower holds only the disbursement, which is short of the
    // payoff by the origination fee plus the interest.
    const ops = await loginAs(`ops-repay-${randomUUID().slice(0, 8)}@default.test`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: loan.borrower.email, amount: amount('50000') })
      .expect(201);

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

    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);

    // Flow 7 names this case: a lender arriving after the borrower already
    // paid is told the loan is closed, not that it never defaulted.
    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(rejected.body.error.code).toBe('LOAN_NOT_ACTIVE');

    const receipt = await harness.prisma.custodyReceipt.findUnique({
      where: { id: loan.receiptId },
    });
    expect(receipt?.holderAccountId).toBe(loan.borrower.accountId);
    expect(receipt?.status).toBe('IN_VAULT');
  });

  it('names the deadline when a default comes too early', async () => {
    const loan = await originate();
    harness.clock.advanceBy(30n * oneDay + oneDay);
    await signInAgain(loan.lender);

    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(rejected.body.error.details.graceEndsAt).toBeTruthy();
  });

  it('carries a lender from default through claim to redemption', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);

    const defaulted = await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(defaulted.body.status).toBe('DEFAULTED');

    const defaultedRow = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
    // The instant is recorded because it starts the statutory holding
    // period the liquidation gate reads.
    expect(defaultedRow?.defaultedAt).not.toBeNull();

    const claimed = await server()
      .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(claimed.body.status).toBe('DEFAULTED');

    const receipt = await harness.prisma.custodyReceipt.findUnique({
      where: { id: loan.receiptId },
    });
    expect(receipt?.holderAccountId).toBe(loan.lender.accountId);
    expect(receipt?.status).toBe('IN_VAULT');
    expect(receipt?.encumberedByLoanId).toBeNull();

    // Flow 7 step 3: the claimant redeems through flow 6 with no special
    // case, which is the whole reason the receipt lands IN_VAULT.
    const redemption = await server()
      .post(`/api/v1/receipts/${loan.receiptId}/redemption-requests`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(redemption.body.requestedByAccountId).toBe(loan.lender.accountId);

    // The borrower cannot redeem what they no longer hold.
    await signInAgain(loan.borrower);
    const refused = await server()
      .get('/api/v1/me/receipts')
      .set('Cookie', loan.borrower.cookies)
      .expect(200);
    expect(refused.body.items.map((item: { id: string }) => item.id)).not.toContain(loan.receiptId);
  });

  it('refuses a second default and a second claim', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);

    await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const again = await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('LOAN_NOT_ACTIVE');

    await server()
      .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const claimAgain = await server()
      .post(`/api/v1/loans/${loan.loanId}/claim-receipt`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    // The receipt is already the claimant's and no longer encumbered, so
    // the custody transition is what refuses the repeat.
    expect(claimAgain.body.error.code).toBe('RECEIPT_NOT_ENCUMBERED');
  });

  it('refuses a repayment once the loan has defaulted', async () => {
    const loan = await originate();
    harness.clock.advanceBy(pastGrace());
    await signInAgain(loan.lender);
    await server()
      .post(`/api/v1/loans/${loan.loanId}/default`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    await signInAgain(loan.borrower);
    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        amount: amount('253698'),
        quotedAt: new Date(Number(harness.clock.now().epochMilliseconds)).toISOString(),
      })
      .expect(409);
    expect(rejected.body.error.code).toBe('LOAN_NOT_ACTIVE');
  });
});
