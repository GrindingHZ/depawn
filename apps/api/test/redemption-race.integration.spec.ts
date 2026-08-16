import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { accountIdOf, redemptionRequestIdOf } from '../src/domain/shared/identifiers';
import { ConfirmReleaseUseCase } from '../src/modules/custody/application/confirm-release.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-RRELEASE-1';
const password = 'a-long-enough-password';
const raceRounds = 20;

describe('release race', () => {
  let harness: TestApplication;
  let confirmRelease: ConfirmReleaseUseCase;

  beforeAll(async () => {
    harness = await createTestApplication();
    confirmRelease = harness.app.get(ConfirmReleaseUseCase);
  });

  afterAll(async () => {
    await harness.close();
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'VAULT_STAFF',
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

  it('hands an item over once when two confirmations race', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      await harness.truncateAllTables();
      await harness.prisma.vault.create({
        data: {
          id: vaultId,
          name: 'Release vault',
          city: 'Sydney',
          insuredLimitMinorUnits: 100_000_000n,
          currency: 'AUD',
        },
      });
      const borrower = await loginAs(`borrower-${round}@release.test`, 'MEMBER');
      const staff = await loginAs(`staff-${round}@release.test`, 'VAULT_STAFF');

      const receiptId = `R-RREL-${round}`;
      await harness.prisma.custodyReceipt.create({
        data: {
          id: receiptId,
          vaultId,
          holderAccountId: borrower.accountId,
          intakeRecordHash: `hash-rrel-${round}`,
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
      const requested = await server()
        .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);
      const requestId = requested.body.id;
      await server()
        .post(`/api/v1/redemption-requests/${requestId}/verify`)
        .set('Cookie', staff.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({})
        .expect(201);

      const releaseOnce = (seal: string): ReturnType<ConfirmReleaseUseCase['execute']> =>
        confirmRelease.execute({
          requestId: redemptionRequestIdOf(requestId),
          releasedBy: accountIdOf(staff.accountId),
          sealNumberBroken: seal,
        });
      const results = await Promise.all([releaseOnce('SEAL-A'), releaseOnce('SEAL-B')]);

      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const rejected = results.find((result) => !result.ok);
      if (rejected !== undefined && !rejected.ok) {
        expect(rejected.error.code, `round ${round}`).toBe('REDEMPTION_ALREADY_RELEASED');
      }

      const row = await harness.prisma.redemptionRequest.findUnique({ where: { id: requestId } });
      expect(row?.status, `round ${round}`).toBe('RELEASED');
      // One handover means one seal on the record, not the last writer's.
      const winner = succeeded[0];
      if (winner !== undefined && winner.ok) {
        expect(row?.sealNumberBroken, `round ${round}`).toBe(winner.value.sealNumberBroken);
      }
      const handovers = await harness.prisma.auditLog.count({
        where: { subjectId: requestId, action: 'confirm_release' },
      });
      expect(handovers, `round ${round}`).toBe(1);
    }
  }, 300_000);
});
