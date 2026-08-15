import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { accountIdOf, loanIdOf } from '../src/domain/shared/identifiers';
import { ClaimReceiptUseCase } from '../src/modules/lending/application/claim-receipt.use-case';
import { MarkDefaultUseCase } from '../src/modules/lending/application/mark-default.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-DRACE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const raceRounds = 20;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('default and claim races', () => {
  let harness: TestApplication;
  let markDefault: MarkDefaultUseCase;
  let claimReceipt: ClaimReceiptUseCase;

  beforeAll(async () => {
    harness = await createTestApplication();
    markDefault = harness.app.get(MarkDefaultUseCase);
    claimReceipt = harness.app.get(ClaimReceiptUseCase);
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
  ): Promise<{ cookies: string[]; accountId: string; email: string }> {
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

  async function originate(round: number): Promise<{
    loanId: string;
    receiptId: string;
    lenderAccountId: string;
  }> {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Race vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'AUD',
      },
    });
    const borrower = await loginAs(`borrower-${round}@drace.test`, 'MEMBER');
    const lender = await loginAs(`lender-${round}@drace.test`, 'MEMBER');
    const ops = await loginAs(`ops-${round}@drace.test`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: lender.email, amount: amount('250000') })
      .expect(201);

    const receiptId = `R-DRACE-${round}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
        intakeRecordHash: `hash-drace-${round}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-DRACE-${round}`;
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

    harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
    return { loanId: accepted.body.id, receiptId, lenderAccountId: lender.accountId };
  }

  it('marks a loan defaulted once when two calls race', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      const loan = await originate(round);
      const defaultOnce = (): ReturnType<MarkDefaultUseCase['execute']> =>
        markDefault.execute({
          loanId: loanIdOf(loan.loanId),
          requestedBy: accountIdOf(loan.lenderAccountId),
        });

      const results = await Promise.all([defaultOnce(), defaultOnce()]);
      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const rejected = results.find((result) => !result.ok);
      if (rejected !== undefined && !rejected.ok) {
        expect(rejected.error.code, `round ${round}`).toBe('LOAN_NOT_ACTIVE');
      }

      const row = await harness.prisma.loan.findUnique({ where: { id: loan.loanId } });
      expect(row?.status, `round ${round}`).toBe('DEFAULTED');
      const events = await harness.prisma.outboxEvent.count({
        where: { type: 'LoanDefaulted' },
      });
      expect(events, `round ${round}`).toBe(1);
      // No money moves in flow 7, so the ledger is untouched by all of this.
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 300_000);

  it('moves the receipt once when two claims race', async () => {
    for (let round = 100; round < 100 + raceRounds; round += 1) {
      const loan = await originate(round);
      const defaulted = await markDefault.execute({
        loanId: loanIdOf(loan.loanId),
        requestedBy: accountIdOf(loan.lenderAccountId),
      });
      expect(defaulted.ok, `round ${round}`).toBe(true);

      const claimOnce = (): ReturnType<ClaimReceiptUseCase['execute']> =>
        claimReceipt.execute({
          loanId: loanIdOf(loan.loanId),
          requestedBy: accountIdOf(loan.lenderAccountId),
        });
      const results = await Promise.all([claimOnce(), claimOnce()]);

      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const receipt = await harness.prisma.custodyReceipt.findUnique({
        where: { id: loan.receiptId },
      });
      expect(receipt?.holderAccountId, `round ${round}`).toBe(loan.lenderAccountId);
      expect(receipt?.status, `round ${round}`).toBe('IN_VAULT');
      const events = await harness.prisma.outboxEvent.count({
        where: { type: 'ReceiptClaimedByLender' },
      });
      expect(events, `round ${round}`).toBe(1);
    }
  }, 300_000);
});
