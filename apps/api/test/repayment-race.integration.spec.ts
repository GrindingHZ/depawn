import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { accountIdOf, loanIdOf } from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { RepayLoanUseCase } from '../src/modules/lending/application/repay-loan.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const aud = currencyOf('AUD');
const vaultId = 'VAULT-RRACE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const raceRounds = 20;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('repayment race and staleness', () => {
  let harness: TestApplication;
  let repayLoan: RepayLoanUseCase;

  beforeAll(async () => {
    harness = await createTestApplication();
    repayLoan = harness.app.get(RepayLoanUseCase);
  });

  afterAll(async () => {
    await harness.close();
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

  async function seedVault(): Promise<void> {
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Race vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'AUD',
      },
    });
  }

  interface OriginatedLoan {
    readonly loanId: string;
    readonly borrower: { cookies: string[]; accountId: string };
    readonly lender: { cookies: string[]; accountId: string };
  }

  async function originate(round: number): Promise<OriginatedLoan> {
    const borrower = await loginAs(`borrower-${round}@rrace.test`, 'MEMBER');
    const lender = await loginAs(`lender-${round}@rrace.test`, 'MEMBER');
    const ops = await loginAs(`ops-${round}@rrace.test`, 'OPERATIONS');
    for (const [email, minorUnits] of [
      [`lender-${round}@rrace.test`, '250000'],
      [`borrower-${round}@rrace.test`, '50000'],
    ] as const) {
      await server()
        .post('/api/v1/me/deposits')
        .set('Cookie', ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ email, amount: amount(minorUnits) })
        .expect(201);
    }

    const receiptId = `R-RRACE-${round}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
        intakeRecordHash: `hash-rrace-${round}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-RRACE-${round}`;
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
    return { loanId: accepted.body.id, borrower, lender };
  }

  it('rejects a quote the clock has overtaken and returns the new figure', async () => {
    await harness.truncateAllTables();
    await seedVault();
    const loan = await originate(900);

    const quotedAt = harness.clock.now();
    harness.clock.advanceBy(10n * oneDay);

    const stale = await repayLoan.execute({
      loanId: loanIdOf(loan.loanId),
      requestedBy: accountIdOf(loan.borrower.accountId),
      payment: Money.of(250_000n, aud),
      quotedAt,
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.error.code).toBe('PAYOFF_QUOTE_STALE');
    }
    const loanRow = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
    expect(loanRow?.status).toBe('ACTIVE');

    // A quote taken now names the figure the borrower must send.
    const fresh = await repayLoan.execute({
      loanId: loanIdOf(loan.loanId),
      requestedBy: accountIdOf(loan.borrower.accountId),
      payment: Money.of(251_232n, aud),
      quotedAt: harness.clock.now(),
    });
    expect(fresh.ok).toBe(true);
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  it('settles once when two repayments race', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      await harness.truncateAllTables();
      await seedVault();
      const loan = await originate(round);

      const quotedAt = harness.clock.now();
      const repayOnce = (): ReturnType<RepayLoanUseCase['execute']> =>
        repayLoan.execute({
          loanId: loanIdOf(loan.loanId),
          requestedBy: accountIdOf(loan.borrower.accountId),
          payment: Money.of(250_000n, aud),
          quotedAt,
        });
      const results = await Promise.all([repayOnce(), repayOnce()]);

      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const rejected = results.find((result) => !result.ok);
      if (rejected !== undefined && !rejected.ok) {
        expect(rejected.error.code, `round ${round}`).toBe('LOAN_NOT_ACTIVE');
      }
      expect(
        await harness.prisma.ledgerTransaction.count({ where: { kind: 'REPAY_LOAN' } }),
        `round ${round}`,
      ).toBe(1);
      const loanRow = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
      expect(loanRow?.status, `round ${round}`).toBe('REPAID');
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 300_000);
});
