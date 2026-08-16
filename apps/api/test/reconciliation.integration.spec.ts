import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const vaultId = 'VAULT-RECON-1';
const password = 'a-long-enough-password';

describe('reconciliation', () => {
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
        name: 'Reconciliation vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000_000n,
        currency: 'AUD',
      },
    });
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

  async function receiptIn(holderAccountId: string): Promise<string> {
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
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    return receiptId;
  }

  it('reports no drift when the count matches the records', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    const first = await receiptIn(member.accountId);
    const second = await receiptIn(member.accountId);

    const run = await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [first, second] })
      .expect(201);
    expect(run.body.drift).toEqual([]);
  });

  it('shows a receipt corrupted behind the application as drift', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    const present = await receiptIn(member.accountId);
    const tampered = await receiptIn(member.accountId);

    // The exit criterion from docs/07: an edit made behind the application's
    // back has to surface. Marking it released without burning it is what a
    // careless hand on the database looks like.
    await harness.prisma.custodyReceipt.update({
      where: { id: tampered },
      data: { status: 'RELEASED' },
    });

    const run = await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [present, tampered] })
      .expect(201);

    expect(run.body.drift).toHaveLength(1);
    expect(run.body.drift[0].kind).toBe('MISSING_FROM_RECORDS');
    expect(run.body.drift[0].subject).toBe(tampered);
    // Both values travel so a human knows what to go and look at.
    expect(run.body.drift[0].expected).toBe('not in the vault');
    expect(run.body.drift[0].observed).toBe('counted');
  });

  it('shows an item the records expect but the counter did not find', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    const present = await receiptIn(member.accountId);
    const missing = await receiptIn(member.accountId);

    const run = await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [present] })
      .expect(201);

    expect(run.body.drift).toHaveLength(1);
    expect(run.body.drift[0].kind).toBe('MISSING_FROM_COUNT');
    expect(run.body.drift[0].subject).toBe(missing);
  });

  it('catches a ledger that no longer sums to zero', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: 'member@recon.test', amount: { minorUnits: '10000', currency: 'AUD' } })
      .expect(201);

    // The database refuses an unbalanced transaction, so the trigger comes
    // off to plant the fault, exactly as the P1 matcher test does. Without
    // this the check has never been shown to catch anything.
    const account = await harness.prisma.ledgerAccount.findFirst({
      where: { ownerId: member.accountId, purpose: 'USER_AVAILABLE' },
    });
    const transaction = await harness.prisma.ledgerTransaction.findFirst();
    if (account === null || transaction === null) {
      throw new Error('the deposit must have written a ledger transaction');
    }
    await harness.prisma.$executeRawUnsafe('ALTER TABLE ledger_entry DISABLE TRIGGER USER');
    await harness.prisma.ledgerEntry.create({
      data: {
        id: `E-${randomUUID().slice(0, 8)}`,
        transactionId: transaction.id,
        accountId: account.id,
        direction: 'CREDIT',
        minorUnits: 1n,
        currency: 'AUD',
      },
    });
    await harness.prisma.$executeRawUnsafe('ALTER TABLE ledger_entry ENABLE TRIGGER USER');

    const run = await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [] })
      .expect(201);

    const global = run.body.drift.find(
      (row: { kind: string }) => row.kind === 'LEDGER_GLOBAL_IMBALANCE',
    );
    expect(global).toBeDefined();
    expect(global.observed).toBe('1');

    // The same planted entry also leaves its own transaction unbalanced,
    // which points at the row to go and look at rather than only saying the
    // ledger is out somewhere.
    const perTransaction = run.body.drift.find(
      (row: { kind: string }) => row.kind === 'LEDGER_TRANSACTION_IMBALANCE',
    );
    expect(perTransaction).toBeDefined();
    expect(perTransaction.subject).toBe(transaction.id);
    expect(perTransaction.observed).toBe('1');
  });

  it('reports the latest run and its drift', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    const receiptId = await receiptIn(member.accountId);
    await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [] })
      .expect(201);

    const latest = await server()
      .get('/api/v1/admin/reconciliation/latest')
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(latest.body.run.vaultId).toBe(vaultId);
    expect(latest.body.run.drift[0].subject).toBe(receiptId);
  });

  it('reports the loan book and the exposure by vault', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    const ops = await loginAs('ops@recon.test', 'OPERATIONS');
    await receiptIn(member.accountId);

    const book = await server()
      .get('/api/v1/admin/loan-book')
      .set('Cookie', ops.cookies)
      .expect(200);
    expect(book.body.outstandingCount).toBe(0);
    expect(book.body.outstandingPrincipal).toEqual({ minorUnits: '0', currency: 'AUD' });

    const exposure = await server()
      .get('/api/v1/admin/exposure-by-vault')
      .set('Cookie', ops.cookies)
      .expect(200);
    const row = exposure.body.items.find((item: { vaultId: string }) => item.vaultId === vaultId);
    expect(row.exposure).toEqual({ minorUnits: '500000', currency: 'AUD' });
    expect(row.receiptCount).toBe(1);
  });

  it('keeps reconciliation away from members', async () => {
    const member = await loginAs('member@recon.test', 'MEMBER');
    await server()
      .post('/api/v1/admin/reconciliation/run')
      .set('Cookie', member.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ vaultId, countedReceiptIds: [] })
      .expect(403);
    await server().get('/api/v1/admin/loan-book').set('Cookie', member.cookies).expect(403);
  });
});
