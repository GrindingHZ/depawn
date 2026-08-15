import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-TEST-1';
const password = 'a-long-enough-password';

describe('intake flow', () => {
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
        name: 'Test vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000n,
        currency: 'AUD',
      },
    });
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  async function loginAs(email: string, role: 'MEMBER' | 'VAULT_STAFF'): Promise<string[]> {
    await server().post('/api/v1/auth/register').send({ email, password }).expect(201);
    if (role !== 'MEMBER') {
      await harness.prisma.account.update({ where: { email }, data: { roles: [role] } });
    }
    const login = await server().post('/api/v1/auth/login').send({ email, password }).expect(200);
    return login.get('Set-Cookie') ?? [];
  }

  async function draftIntakeThroughAppraisal(staffCookies: string[]): Promise<string> {
    const begun = await server()
      .post(`/api/v1/vaults/${vaultId}/intakes`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        borrowerEmail: 'borrower@intake.test',
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar',
      })
      .expect(201);
    const intakeId: string = begun.body.id;

    await server()
      .patch(`/api/v1/intakes/${intakeId}`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ serialNumbers: ['SN-1'], sealNumber: 'SEAL-42' })
      .expect(200);

    await server()
      .post(`/api/v1/intakes/${intakeId}/photos`)
      .set('Cookie', staffCookies)
      .attach('photo', Buffer.from('fake image bytes'), 'front.jpg')
      .expect(201);

    await server()
      .post(`/api/v1/intakes/${intakeId}/appraisals`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        value: { minorUnits: '500000', currency: 'AUD' },
        method: 'spot times weight',
        comparableReferences: 'LBMA fix',
      })
      .expect(201);

    return intakeId;
  }

  it('walks intake from begin to an issued receipt', async () => {
    const staffCookies = await loginAs('staff@intake.test', 'VAULT_STAFF');
    const borrowerCookies = await loginAs('borrower@intake.test', 'MEMBER');
    const intakeId = await draftIntakeThroughAppraisal(staffCookies);

    const premature = await server()
      .post(`/api/v1/intakes/${intakeId}/issue-receipt`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ insurancePolicyReference: 'POL-1' })
      .expect(409);
    expect(premature.body.error.code).toBe('INTAKE_NOT_SEALED');

    const sealed = await server()
      .post(`/api/v1/intakes/${intakeId}/seal`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(sealed.body.status).toBe('SEALED');
    expect(sealed.body.sealedHash).toMatch(/^[0-9a-f]{64}$/);

    const lateEdit = await server()
      .patch(`/api/v1/intakes/${intakeId}`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ sealNumber: 'SEAL-99' })
      .expect(409);
    expect(lateEdit.body.error.code).toBe('INTAKE_ALREADY_SEALED');

    const issued = await server()
      .post(`/api/v1/intakes/${intakeId}/issue-receipt`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ insurancePolicyReference: 'POL-1' })
      .expect(201);
    expect(issued.body.status).toBe('IN_VAULT');
    expect(issued.body.intakeRecordHash).toBe(sealed.body.sealedHash);

    const reIssued = await server()
      .post(`/api/v1/intakes/${intakeId}/issue-receipt`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ insurancePolicyReference: 'POL-1' })
      .expect(201);
    expect(reIssued.body.id).toBe(issued.body.id);
    expect(await harness.prisma.custodyReceipt.count()).toBe(1);

    const mine = await server()
      .get('/api/v1/me/receipts')
      .set('Cookie', borrowerCookies)
      .expect(200);
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].id).toBe(issued.body.id);

    const exposure = await server()
      .get(`/api/v1/vaults/${vaultId}/exposure`)
      .set('Cookie', staffCookies)
      .expect(200);
    expect(exposure.body.exposure.minorUnits).toBe('500000');
    expect(exposure.body.remaining.minorUnits).toBe('500000');

    const inventory = await server()
      .get(`/api/v1/vaults/${vaultId}/inventory?status=IN_VAULT`)
      .set('Cookie', staffCookies)
      .expect(200);
    expect(inventory.body.items).toHaveLength(1);

    const outboxEvents = await harness.prisma.outboxEvent.findMany({
      where: { type: 'ReceiptIssued' },
    });
    expect(outboxEvents).toHaveLength(1);
    expect(await harness.prisma.auditLog.count()).toBeGreaterThanOrEqual(5);
  });

  it('hides another members receipt', async () => {
    const staffCookies = await loginAs('staff@intake.test', 'VAULT_STAFF');
    await loginAs('borrower@intake.test', 'MEMBER');
    const strangerCookies = await loginAs('stranger@intake.test', 'MEMBER');
    const intakeId = await draftIntakeThroughAppraisal(staffCookies);
    await server()
      .post(`/api/v1/intakes/${intakeId}/seal`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const issued = await server()
      .post(`/api/v1/intakes/${intakeId}/issue-receipt`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({ insurancePolicyReference: 'POL-1' })
      .expect(201);

    await server()
      .get(`/api/v1/receipts/${issued.body.id}`)
      .set('Cookie', strangerCookies)
      .expect(404);
  });

  it('rejects sealing without evidence and demands dual appraisal at the threshold', async () => {
    const staffCookies = await loginAs('staff@intake.test', 'VAULT_STAFF');
    await loginAs('borrower@intake.test', 'MEMBER');

    const bare = await server()
      .post(`/api/v1/vaults/${vaultId}/intakes`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        borrowerEmail: 'borrower@intake.test',
        itemCategory: 'BULLION',
        itemDescription: 'Bar',
      })
      .expect(201);
    const incomplete = await server()
      .post(`/api/v1/intakes/${bare.body.id}/seal`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(incomplete.body.error.code).toBe('INTAKE_INCOMPLETE');

    const secondStaffCookies = await loginAs('staff2@intake.test', 'VAULT_STAFF');
    const intakeId = await draftIntakeThroughAppraisal(staffCookies);
    await server()
      .post(`/api/v1/intakes/${intakeId}/appraisals`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        value: { minorUnits: '10000000', currency: 'AUD' },
        method: 'spot times weight',
        comparableReferences: 'LBMA fix',
      })
      .expect(201);

    const single = await server()
      .post(`/api/v1/intakes/${intakeId}/seal`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(422);
    expect(single.body.error.code).toBe('DUAL_APPRAISAL_REQUIRED');

    await server()
      .post(`/api/v1/intakes/${intakeId}/appraisals`)
      .set('Cookie', secondStaffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        value: { minorUnits: '10000000', currency: 'AUD' },
        method: 'independent check',
        comparableReferences: 'LBMA fix',
      })
      .expect(201);
    await server()
      .post(`/api/v1/intakes/${intakeId}/seal`)
      .set('Cookie', staffCookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
  });

  it('refuses intake endpoints to members', async () => {
    const memberCookies = await loginAs('plain@intake.test', 'MEMBER');
    const refused = await server()
      .post(`/api/v1/vaults/${vaultId}/intakes`)
      .set('Cookie', memberCookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        borrowerEmail: 'plain@intake.test',
        itemCategory: 'BULLION',
        itemDescription: 'Bar',
      })
      .expect(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
  });
});
