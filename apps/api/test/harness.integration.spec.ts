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

  it('controls time through the fixed clock', () => {
    const before = harness.clock.now();
    harness.clock.advanceBy(86_400_000n);
    expect(harness.clock.now().millisecondsSince(before)).toBe(86_400_000n);
  });
});
