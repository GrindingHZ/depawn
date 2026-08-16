import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AUDIT_PORT } from '../src/domain/ports/audit.port';
import type { AuditPort } from '../src/domain/ports/audit.port';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-PARAM-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('protocol parameters', () => {
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
        name: 'Parameters vault',
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

  async function currentParameters(ops: Party): Promise<Record<string, unknown>> {
    const response = await server()
      .get('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .expect(200);
    return response.body.current;
  }

  async function originate(
    borrower: Party,
    lender: Party,
    ops: Party,
  ): Promise<{ loanId: string; receiptId: string }> {
    const suffix = randomUUID().slice(0, 8);
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: lender.email, amount: amount('250000') })
      .expect(201);

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
        itemDescription: 'One kilogram gold bar, cast',
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
    return { loanId: accepted.body.id, receiptId };
  }

  it('reports the defaults before anyone has edited them', async () => {
    const ops = await loginAs('ops@param.test', 'OPERATIONS');
    const current = await currentParameters(ops);
    expect(current.originationFeeBasisPoints).toBe(200);
    const history = await server()
      .get('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(history.body.history).toEqual([]);
  });

  it('applies an edit to new business and keeps the history', async () => {
    const ops = await loginAs('ops@param.test', 'OPERATIONS');
    const current = await currentParameters(ops);

    const updated = await server()
      .put('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        effectiveAt: new Date(Number(harness.clock.now().epochMilliseconds)).toISOString(),
        parameters: { ...current, originationFeeBasisPoints: 500 },
      })
      .expect(200);
    expect(updated.body.current.originationFeeBasisPoints).toBe(500);
    expect(updated.body.history).toHaveLength(1);
    expect(updated.body.history[0].writtenByAccountId).toBe(ops.accountId);

    const audits = await harness.prisma.auditLog.findMany({
      where: { subjectType: 'protocol_parameters' },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe('update_protocol_parameters');
  });

  /* The edit and its audit entry are one transaction, so a failure cannot
     leave a committed edit nobody can trace to an operator. Rolling back on
     the audit write is the only way to see the two halves separately. */
  it('writes no version when the audit entry cannot be written', async () => {
    const ops = await loginAs('ops@param.test', 'OPERATIONS');
    const current = await currentParameters(ops);
    const audit = harness.app.get<AuditPort>(AUDIT_PORT);
    const record = audit.record.bind(audit);
    audit.record = () => Promise.reject(new Error('the audit log is unavailable'));

    try {
      await server()
        .put('/api/v1/admin/protocol-parameters')
        .set('Cookie', ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({
          effectiveAt: new Date(Number(harness.clock.now().epochMilliseconds)).toISOString(),
          parameters: { ...current, originationFeeBasisPoints: 700 },
        })
        .expect(500);
    } finally {
      audit.record = record;
    }

    expect(await harness.prisma.protocolParameterVersion.count()).toBe(0);
    expect((await currentParameters(ops)).originationFeeBasisPoints).toBe(200);
  });

  it('leaves a version dated in the future waiting', async () => {
    const ops = await loginAs('ops@param.test', 'OPERATIONS');
    const current = await currentParameters(ops);

    await server()
      .put('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        effectiveAt: new Date(
          Number(harness.clock.now().epochMilliseconds) + Number(oneDay),
        ).toISOString(),
        parameters: { ...current, originationFeeBasisPoints: 900 },
      })
      .expect(200);

    expect((await currentParameters(ops)).originationFeeBasisPoints).toBe(200);
    harness.clock.advanceBy(oneDay);
    expect((await currentParameters(ops)).originationFeeBasisPoints).toBe(900);
  });

  it('changes what a new loan pays and leaves an existing loan alone', async () => {
    const borrower = await loginAs('borrower@param.test', 'MEMBER');
    const lender = await loginAs('lender@param.test', 'MEMBER');
    const ops = await loginAs('ops@param.test', 'OPERATIONS');
    const first = await originate(borrower, lender, ops);

    // 200 basis points of 250000 is 5000, so the borrower received 245000.
    const beforeEdit = await harness.prisma.loan.findUnique({ where: { id: first.loanId } });
    expect(beforeEdit?.principalMinorUnits).toBe(250_000n);
    const borrowerBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', borrower.cookies)
      .expect(200);
    expect(borrowerBalance.body.available).toEqual(amount('245000'));

    const current = await currentParameters(ops);
    await server()
      .put('/api/v1/admin/protocol-parameters')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        effectiveAt: new Date(Number(harness.clock.now().epochMilliseconds)).toISOString(),
        parameters: { ...current, originationFeeBasisPoints: 1000 },
      })
      .expect(200);

    // The loan already originated is untouched: its terms travelled with it.
    const afterEdit = await harness.prisma.loan.findUnique({ where: { id: first.loanId } });
    expect(afterEdit?.principalMinorUnits).toBe(beforeEdit?.principalMinorUnits);
    expect(afterEdit?.annualPercentageRateBasisPoints).toBe(
      beforeEdit?.annualPercentageRateBasisPoints,
    );
    expect(afterEdit?.maturesAt.getTime()).toBe(beforeEdit?.maturesAt.getTime());
    expect(afterEdit?.graceEndsAt.getTime()).toBe(beforeEdit?.graceEndsAt.getTime());
    const unchangedBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', borrower.cookies)
      .expect(200);
    expect(unchangedBalance.body.available).toEqual(amount('245000'));

    // The next loan pays the new fee: 1000 basis points of 250000 is 25000.
    const secondBorrower = await loginAs('borrower2@param.test', 'MEMBER');
    const secondLender = await loginAs('lender2@param.test', 'MEMBER');
    await originate(secondBorrower, secondLender, ops);
    const secondBalance = await server()
      .get('/api/v1/me/balance')
      .set('Cookie', secondBorrower.cookies)
      .expect(200);
    expect(secondBalance.body.available).toEqual(amount('225000'));
  });

  it('keeps the parameters away from members', async () => {
    const member = await loginAs('member@param.test', 'MEMBER');
    await server()
      .get('/api/v1/admin/protocol-parameters')
      .set('Cookie', member.cookies)
      .expect(403);
  });
});
