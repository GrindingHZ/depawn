import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-REDEEM-1';
const password = 'a-long-enough-password';

describe('redemption', () => {
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
        name: 'Redemption vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 100_000_000n,
        currency: 'AUD',
      },
    });
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

  async function receiptFor(holderAccountId: string, encumbered = false): Promise<string> {
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
        insurancePolicyReference: 'POL-1',
        status: encumbered ? 'ENCUMBERED' : 'IN_VAULT',
        encumberedByLoanId: encumbered ? `LOAN-${suffix}` : null,
      },
    });
    return receiptId;
  }

  async function exposure(): Promise<bigint> {
    const rows = await harness.prisma.$queryRaw<{ exposure: bigint }[]>`
      SELECT COALESCE(SUM(appraised_value_minor_units), 0)::bigint AS exposure
      FROM custody_receipt
      WHERE vault_id = ${vaultId} AND status IN ('IN_VAULT', 'ENCUMBERED')
    `;
    return rows[0]?.exposure ?? 0n;
  }

  it('burns the receipt at request time and drops the vault exposure', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const receiptId = await receiptFor(borrower.accountId);
    expect(await exposure()).toBe(500_000n);

    const requested = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(requested.body.status).toBe('REQUESTED');
    expect(requested.body.receiptId).toBe(receiptId);
    expect(requested.body.verifiedAt).toBeNull();

    // The burn is the entitlement proof, so it happens here rather than at
    // the counter, and the item leaves the insured exposure with it.
    const receipt = await harness.prisma.custodyReceipt.findUnique({ where: { id: receiptId } });
    expect(receipt?.status).toBe('RELEASED');
    expect(await exposure()).toBe(0n);
  });

  it('refuses a second request on a burned receipt', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const receiptId = await receiptFor(borrower.accountId);
    await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const again = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('RECEIPT_ALREADY_BURNED');
    expect(await harness.prisma.redemptionRequest.count()).toBe(1);
  });

  it('refuses a request against collateral on a live loan', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const receiptId = await receiptFor(borrower.accountId, true);

    const rejected = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(rejected.body.error.code).toBe('RECEIPT_ENCUMBERED');

    const receipt = await harness.prisma.custodyReceipt.findUnique({ where: { id: receiptId } });
    expect(receipt?.status).toBe('ENCUMBERED');
    expect(await harness.prisma.redemptionRequest.count()).toBe(0);
  });

  it('refuses a request from anyone but the holder', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const stranger = await loginAs('stranger@redeem.test', 'MEMBER');
    const receiptId = await receiptFor(borrower.accountId);

    const rejected = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', stranger.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');

    const receipt = await harness.prisma.custodyReceipt.findUnique({ where: { id: receiptId } });
    expect(receipt?.status).toBe('IN_VAULT');
  });

  it('walks the counter in two recorded steps', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const staff = await loginAs('staff@redeem.test', 'VAULT_STAFF');
    const receiptId = await receiptFor(borrower.accountId);
    const requested = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const requestId = requested.body.id;

    const early = await server()
      .post(`/api/v1/redemption-requests/${requestId}/release`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ sealNumberBroken: 'SEAL-9' })
      .expect(409);
    expect(early.body.error.code).toBe('REDEMPTION_NOT_VERIFIED');

    const queue = await server()
      .get(`/api/v1/redemption-requests?vaultId=${vaultId}`)
      .set('Cookie', staff.cookies)
      .expect(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).toEqual([requestId]);

    const verified = await server()
      .post(`/api/v1/redemption-requests/${requestId}/verify`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(verified.body.status).toBe('VERIFIED');
    expect(verified.body.verifiedByStaffId).toBe(staff.accountId);

    const released = await server()
      .post(`/api/v1/redemption-requests/${requestId}/release`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ sealNumberBroken: 'SEAL-9' })
      .expect(201);
    expect(released.body.status).toBe('RELEASED');
    expect(released.body.sealNumberBroken).toBe('SEAL-9');
    // Both events survive on the record; a dispute needs to tell them apart.
    expect(released.body.verifiedByStaffId).toBe(staff.accountId);
    expect(released.body.releasedAt).not.toBeNull();

    const audits = await harness.prisma.auditLog.findMany({
      where: { subjectId: requestId },
      orderBy: { createdAt: 'asc' },
    });
    expect(audits.map((entry) => entry.action)).toEqual([
      'request_redemption',
      'verify_redemption',
      'confirm_release',
    ]);

    const emptied = await server()
      .get(`/api/v1/redemption-requests?vaultId=${vaultId}`)
      .set('Cookie', staff.cookies)
      .expect(200);
    expect(emptied.body.items).toHaveLength(0);
  });

  it('tells staff plainly when identity was already verified', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    const staff = await loginAs('staff@redeem.test', 'VAULT_STAFF');
    const receiptId = await receiptFor(borrower.accountId);
    const requested = await server()
      .post(`/api/v1/receipts/${receiptId}/redemption-requests`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    await server()
      .post(`/api/v1/redemption-requests/${requested.body.id}/verify`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    const again = await server()
      .post(`/api/v1/redemption-requests/${requested.body.id}/verify`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('REDEMPTION_ALREADY_VERIFIED');
    expect(again.body.error.message).not.toContain('has not been verified');
  });

  it('keeps the queue away from members', async () => {
    const borrower = await loginAs('borrower@redeem.test', 'MEMBER');
    await server()
      .get(`/api/v1/redemption-requests?vaultId=${vaultId}`)
      .set('Cookie', borrower.cookies)
      .expect(403);
  });
});
