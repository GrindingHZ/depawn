import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-AUDIT-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('audit trail', () => {
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
        name: 'Audit vault',
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
    readonly cookies: string[];
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

  async function seedListing(borrower: Party, ops: Party): Promise<string> {
    const suffix = randomUUID().slice(0, 8);
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
    const created = await server()
      .post('/api/v1/listings')
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        receiptId,
        requestedPrincipal: amount('250000'),
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: Number(30n * oneDay),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      })
      .expect(201);
    await server()
      .post(`/api/v1/listings/${created.body.id}/publish`)
      .set('Cookie', borrower.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    expect(ops.accountId).toBeTruthy();
    return created.body.id;
  }

  it('records who did what to which subject, with the before and after', async () => {
    const borrower = await loginAs('borrower@audit.test', 'MEMBER');
    const ops = await loginAs('ops@audit.test', 'OPERATIONS');
    const listingId = await seedListing(borrower, ops);

    const page = await server()
      .get(`/api/v1/admin/audit-log?subject=${listingId}`)
      .set('Cookie', ops.cookies)
      .expect(200);

    const actions = page.body.items.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('create_listing');
    expect(actions).toContain('publish_listing');
    const publish = page.body.items.find(
      (entry: { action: string }) => entry.action === 'publish_listing',
    );
    expect(publish.actorId).toBe(borrower.accountId);
    expect(publish.subjectType).toBe('listing');
    expect(publish.recordedAt).toBeTruthy();
    // A transition records both sides so a reader can see what changed.
    expect(publish.before).toEqual({ status: 'DRAFT' });
    expect(publish.after).toEqual({ status: 'ACTIVE' });
  });

  it('composes the filters', async () => {
    const borrower = await loginAs('borrower@audit.test', 'MEMBER');
    const other = await loginAs('other@audit.test', 'MEMBER');
    const ops = await loginAs('ops@audit.test', 'OPERATIONS');
    const mine = await seedListing(borrower, ops);
    await seedListing(other, ops);

    const byActor = await server()
      .get(`/api/v1/admin/audit-log?actor=${borrower.accountId}`)
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(
      byActor.body.items.every(
        (entry: { actorId: string }) => entry.actorId === borrower.accountId,
      ),
    ).toBe(true);

    const bySubjectType = await server()
      .get('/api/v1/admin/audit-log?subjectType=listing')
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(bySubjectType.body.items.length).toBeGreaterThanOrEqual(4);

    const both = await server()
      .get(`/api/v1/admin/audit-log?subjectType=listing&subject=${mine}`)
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(both.body.items).toHaveLength(2);
  });

  it('walks pages without repeating or dropping an entry', async () => {
    const borrower = await loginAs('borrower@audit.test', 'MEMBER');
    const ops = await loginAs('ops@audit.test', 'OPERATIONS');
    for (let index = 0; index < 14; index += 1) {
      await seedListing(borrower, ops);
    }

    const first = await server()
      .get('/api/v1/admin/audit-log?subjectType=listing')
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(first.body.items).toHaveLength(25);
    expect(first.body.nextCursor).not.toBeNull();

    const second = await server()
      .get(`/api/v1/admin/audit-log?subjectType=listing&cursor=${first.body.nextCursor}`)
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(second.body.items).toHaveLength(3);
    expect(second.body.nextCursor).toBeNull();

    const ids = [...first.body.items, ...second.body.items].map(
      (entry: { id: string }) => entry.id,
    );
    expect(new Set(ids).size).toBe(28);
  });

  it('keeps the trail away from members', async () => {
    const member = await loginAs('member@audit.test', 'MEMBER');
    await server().get('/api/v1/admin/audit-log').set('Cookie', member.cookies).expect(403);
  });
});
