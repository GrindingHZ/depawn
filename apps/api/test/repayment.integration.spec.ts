import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-REPAY-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('repayment', () => {
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
        name: 'Repayment vault',
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

  async function fund(email: string, minorUnits: string): Promise<void> {
    const ops = await loginAs(`ops-${email}`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
  }

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  interface OriginatedLoan {
    readonly loanId: string;
    readonly receiptId: string;
    readonly borrower: Party;
    readonly lender: Party;
  }

  /* Sessions expire against the same clock the loan accrues against, so a
     test that jumps days forward has to sign its actors back in exactly as a
     returning borrower would. */
  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  async function originate(): Promise<OriginatedLoan> {
    const suffix = randomUUID().slice(0, 8);
    const borrower = await loginAs(`borrower-${suffix}@repay.test`, 'MEMBER');
    const lender = await loginAs(`lender-${suffix}@repay.test`, 'MEMBER');
    await fund(`lender-${suffix}@repay.test`, '250000');
    // The borrower needs headroom for the interest as well as the principal.
    await fund(`borrower-${suffix}@repay.test`, '50000');

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
        requestedDurationMs: (30n * oneDay).toString(),
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

    return {
      loanId: accepted.body.id,
      receiptId,
      borrower: { ...borrower, email: `borrower-${suffix}@repay.test` },
      lender: { ...lender, email: `lender-${suffix}@repay.test` },
    };
  }

  it('quotes, settles, pays the note holder, and frees the collateral', async () => {
    const loan = await originate();
    harness.clock.advanceBy(10n * oneDay);
    await signInAgain(loan.borrower);
    await signInAgain(loan.lender);

    const quote = await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.borrower.cookies)
      .expect(200);
    expect(quote.body.principal).toEqual(amount('250000'));
    // 250000 at 1800 basis points for 10 of 365 days truncates to 1232.
    expect(quote.body.accruedInterest).toEqual(amount('1232'));
    expect(quote.body.total).toEqual(amount('251232'));
    expect(new Date(quote.body.validUntil).getTime()).toBeGreaterThan(
      new Date(quote.body.quotedAt).getTime(),
    );

    const repaid = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
      .expect(201);
    expect(repaid.body.loan.status).toBe('REPAID');
    expect(repaid.body.total).toEqual(amount('251232'));
    expect(repaid.body.paidToAccountId).toBe(loan.lender.accountId);

    const lenderBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', loan.lender.cookies)
      .expect(200);
    // The lender funded 250000 and is made whole plus the interest.
    expect(lenderBalance.body.available).toEqual(amount('251232'));

    const borrowerBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', loan.borrower.cookies)
      .expect(200);
    // 245000 disbursed plus 50000 funded less the 251232 repaid.
    expect(borrowerBalance.body.available).toEqual(amount('43768'));

    const receipt = await harness.prisma.custodyReceipt.findUnique({
      where: { id: loan.receiptId },
    });
    expect(receipt?.status).toBe('IN_VAULT');
    expect(receipt?.encumberedByLoanId).toBeNull();
    expect(receipt?.holderAccountId).toBe(loan.borrower.accountId);
  });

  it('refuses a second repayment', async () => {
    const loan = await originate();
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

    const second = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
      .expect(409);
    expect(second.body.error.code).toBe('LOAN_NOT_ACTIVE');
    expect(await harness.prisma.ledgerTransaction.count({ where: { kind: 'REPAY_LOAN' } })).toBe(1);
  });

  it('refuses a payment below the amount due and names the figure', async () => {
    const loan = await originate();
    harness.clock.advanceBy(10n * oneDay);
    await signInAgain(loan.borrower);
    const quote = await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.borrower.cookies)
      .expect(200);

    const short = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: amount('251231'), quotedAt: quote.body.quotedAt })
      .expect(422);
    expect(short.body.error.code).toBe('REPAYMENT_AMOUNT_INSUFFICIENT');
    expect(short.body.error.details.amountDue).toEqual(amount('251232'));

    const loanRow = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
    expect(loanRow?.status).toBe('ACTIVE');
  });

  it('refuses repayment by anyone but the borrower', async () => {
    const loan = await originate();
    const quote = await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.borrower.cookies)
      .expect(200);

    const rejected = await server()
      .post(`/api/v1/loans/${loan.loanId}/repay`)
      .set('Cookie', loan.lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ amount: quote.body.total, quotedAt: quote.body.quotedAt })
      .expect(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');
  });

  it('hides the quote from anyone who is not party to the loan', async () => {
    const loan = await originate();
    const stranger = await loginAs(`stranger-${randomUUID().slice(0, 8)}@repay.test`, 'MEMBER');
    await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', stranger.cookies)
      .expect(404);
    // The lender is party to it and may read the figure they are owed.
    await server()
      .get(`/api/v1/loans/${loan.loanId}/payoff-quote`)
      .set('Cookie', loan.lender.cookies)
      .expect(200);
  });
});
