import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

describe('test harness', () => {
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

  it('boots the application against a fresh postgres', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('shapes unknown routes through the error filter', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/v1/missing').expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('truncates tables between tests', async () => {
    await harness.prisma.account.create({
      data: { id: '01TEST', email: 'probe@example.test', passwordHash: 'irrelevant', roles: [] },
    });
    expect(await harness.prisma.account.count()).toBe(1);
    await harness.truncateAllTables();
    expect(await harness.prisma.account.count()).toBe(0);
  });

  it('sums an empty ledger to zero', async () => {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  it('sums a balanced ledger to zero and the trigger rejects an unbalanced insert', async () => {
    await harness.prisma.ledgerAccount.createMany({
      data: [
        { id: 'LA1', ownerType: 'USER', ownerId: 'U1', purpose: 'USER_AVAILABLE', currency: 'AUD' },
        { id: 'LA2', ownerType: 'USER', ownerId: 'U1', purpose: 'USER_HELD', currency: 'AUD' },
      ],
    });
    await harness.prisma.ledgerTransaction.create({
      data: { id: 'LT1', kind: 'HOLD_FUNDS', reference: 'probe', occurredAt: new Date(0) },
    });
    await harness.prisma.ledgerEntry.createMany({
      data: [
        {
          id: 'LE1',
          transactionId: 'LT1',
          accountId: 'LA1',
          direction: 'DEBIT',
          minorUnits: 2500n,
          currency: 'AUD',
        },
        {
          id: 'LE2',
          transactionId: 'LT1',
          accountId: 'LA2',
          direction: 'CREDIT',
          minorUnits: 2500n,
          currency: 'AUD',
        },
      ],
    });
    await expectLedgerBalances(harness.prisma).toSumToZero();

    // The deferred constraint trigger is the database layer of the balance
    // invariant: an unbalanced entry cannot even be committed, so the matcher
    // can never observe an unbalanced ledger.
    await expect(
      harness.prisma.ledgerEntry.create({
        data: {
          id: 'LE3',
          transactionId: 'LT1',
          accountId: 'LA2',
          direction: 'CREDIT',
          minorUnits: 1n,
          currency: 'AUD',
        },
      }),
    ).rejects.toThrow();
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });

  it('controls time through the fixed clock', () => {
    const before = harness.clock.now();
    harness.clock.advanceBy(86_400_000n);
    expect(harness.clock.now().millisecondsSince(before)).toBe(86_400_000n);
  });
});
