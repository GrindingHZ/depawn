import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { solidPng } from '../src/infrastructure/storage/solid-png';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-PHOTO-1';
const password = 'a-long-enough-password';
const oneDay = 24 * 60 * 60 * 1000;

describe('receipt photographs', () => {
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
        name: 'Photograph vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000_000n,
        currency: 'AUD',
      },
    });
  });

  function server(): ReturnType<typeof request> {
    return request(harness.app.getHttpServer());
  }

  interface Party {
    cookies: string[];
    readonly accountId: string;
    readonly email: string;
  }

  async function loginAs(
    email: string,
    role: 'MEMBER' | 'VAULT_STAFF' | 'OPERATIONS',
  ): Promise<Party> {
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

  async function issueReceipt(staff: Party, borrowerEmail: string): Promise<string> {
    const begun = await server()
      .post(`/api/v1/vaults/${vaultId}/intakes`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        borrowerEmail,
        itemCategory: 'WATCH',
        itemDescription: 'Steel chronograph, box and papers',
      })
      .expect(201);
    const intakeId = begun.body.id;

    await server()
      .patch(`/api/v1/intakes/${intakeId}`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ sealNumber: `SEAL-${randomUUID().slice(0, 8)}` })
      .expect(200);
    await server()
      .post(`/api/v1/intakes/${intakeId}/photos`)
      .set('Cookie', staff.cookies)
      .attach('photo', solidPng(48, 48, [92, 105, 118]), 'front.png')
      .expect(201);
    await server()
      .post(`/api/v1/intakes/${intakeId}/appraisals`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        value: { minorUnits: '900000', currency: 'AUD' },
        method: 'comparable sales',
        comparableReferences: 'register',
      })
      .expect(201);
    await server()
      .post(`/api/v1/intakes/${intakeId}/seal`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const issued = await server()
      .post(`/api/v1/intakes/${intakeId}/issue-receipt`)
      .set('Cookie', staff.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ insurancePolicyReference: 'POL-PHOTO' })
      .expect(201);
    return issued.body.id;
  }

  async function publish(borrower: Party, receiptId: string): Promise<void> {
    const listing = await server()
      .post('/api/v1/listings')
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        receiptId,
        requestedPrincipal: { minorUnits: '200000', currency: 'AUD' },
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 30 * oneDay,
        requestedLifetimeMs: 14 * oneDay,
      })
      .expect(201);
    await server()
      .post(`/api/v1/listings/${listing.body.id}/publish`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
  }

  it('serves the photograph to the holder with the type it verified at upload', async () => {
    const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
    const borrower = await loginAs('borrower@photo.test', 'MEMBER');
    const receiptId = await issueReceipt(staff, borrower.email);

    const response = await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', borrower.cookies)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toContain('immutable');
    expect(response.headers.etag).toBeDefined();
    // The bytes come back unchanged, signature and all.
    expect(response.body.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  /* The rule the owner chose: an item resting privately in the vault is
     nobody else's business, but offering it to the market is consent. */
  it('hides an item belonging to somebody else until it is listed', async () => {
    const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
    const borrower = await loginAs('borrower@photo.test', 'MEMBER');
    const stranger = await loginAs('stranger@photo.test', 'MEMBER');
    const receiptId = await issueReceipt(staff, borrower.email);

    await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', stranger.cookies)
      .expect(404);

    await publish(borrower, receiptId);

    await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', stranger.cookies)
      .expect(200);
  });

  it('shows every item to vault staff and to operations', async () => {
    const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
    const borrower = await loginAs('borrower@photo.test', 'MEMBER');
    const operations = await loginAs('ops@photo.test', 'OPERATIONS');
    const receiptId = await issueReceipt(staff, borrower.email);

    await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', staff.cookies)
      .expect(200);
    await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', operations.cookies)
      .expect(200);
  });

  it('shows nothing to anyone signed out', async () => {
    const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
    const borrower = await loginAs('borrower@photo.test', 'MEMBER');
    const receiptId = await issueReceipt(staff, borrower.email);
    await publish(borrower, receiptId);

    await server().get(`/api/v1/receipts/${receiptId}/photo`).expect(401);
  });

  /* Not visible has to read as not found, or the status code becomes an
     oracle for which receipts exist. */
  it('answers the same way for a hidden item and one that never existed', async () => {
    const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
    const borrower = await loginAs('borrower@photo.test', 'MEMBER');
    const stranger = await loginAs('stranger@photo.test', 'MEMBER');
    const receiptId = await issueReceipt(staff, borrower.email);

    const hidden = await server()
      .get(`/api/v1/receipts/${receiptId}/photo`)
      .set('Cookie', stranger.cookies)
      .expect(404);
    const missing = await server()
      .get('/api/v1/receipts/R-DOES-NOT-EXIST/photo')
      .set('Cookie', stranger.cookies)
      .expect(404);

    expect(hidden.body).toEqual(missing.body);
  });

  describe('what the upload refuses', () => {
    async function draftIntake(staff: Party, borrowerEmail: string): Promise<string> {
      const begun = await server()
        .post(`/api/v1/vaults/${vaultId}/intakes`)
        .set('Cookie', staff.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ borrowerEmail, itemCategory: 'ART', itemDescription: 'Signed screenprint' })
        .expect(201);
      return begun.body.id;
    }

    it('refuses a script that has been renamed to look like a photograph', async () => {
      const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
      const borrower = await loginAs('borrower@photo.test', 'MEMBER');
      const intakeId = await draftIntake(staff, borrower.email);

      const response = await server()
        .post(`/api/v1/intakes/${intakeId}/photos`)
        .set('Cookie', staff.cookies)
        .attach('photo', Buffer.from('<script>fetch("https://evil.test")</script>'), 'front.png')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(response.body.error.message).toContain('JPEG and PNG');
    });

    it('refuses an empty file', async () => {
      const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
      const borrower = await loginAs('borrower@photo.test', 'MEMBER');
      const intakeId = await draftIntake(staff, borrower.email);

      await server()
        .post(`/api/v1/intakes/${intakeId}/photos`)
        .set('Cookie', staff.cookies)
        .attach('photo', Buffer.alloc(0), 'front.png')
        .expect(400);
    });

    it('stores nothing when it refuses', async () => {
      const staff = await loginAs('staff@photo.test', 'VAULT_STAFF');
      const borrower = await loginAs('borrower@photo.test', 'MEMBER');
      const intakeId = await draftIntake(staff, borrower.email);

      await server()
        .post(`/api/v1/intakes/${intakeId}/photos`)
        .set('Cookie', staff.cookies)
        .attach('photo', Buffer.from('not an image at all'), 'front.png')
        .expect(400);

      const intake = await harness.prisma.intakeRecord.findUnique({ where: { id: intakeId } });
      expect(intake?.evidence).toEqual([]);
    });
  });
});
