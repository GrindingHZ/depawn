import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AcceptOfferUseCase } from '../src/modules/lending/application/accept-offer.use-case';
import { accountIdOf, listingIdOf, offerIdOf } from '../src/domain/shared/identifiers';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const vaultId = 'VAULT-ORACE-1';
const password = 'a-long-enough-password';
const raceRounds = 20;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('origination race and idempotency', () => {
  let harness: TestApplication;
  let acceptOffer: AcceptOfferUseCase;

  beforeAll(async () => {
    harness = await createTestApplication();
    acceptOffer = harness.app.get(AcceptOfferUseCase);
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

  async function fundedLender(
    email: string,
    minorUnits: string,
  ): Promise<{ cookies: string[]; accountId: string }> {
    const lender = await loginAs(email, 'MEMBER');
    const ops = await loginAs(`ops-${email}`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email, amount: amount(minorUnits) })
      .expect(201);
    return lender;
  }

  async function seededListing(
    round: number,
    borrowerAccountId: string,
  ): Promise<{ listingId: string; receiptId: string }> {
    const receiptId = `R-ORACE-${round}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrowerAccountId,
        intakeRecordHash: `hash-orace-${round}`,
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
    const listingId = `L-ORACE-${round}`;
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 2_592_000_000n,
        expiresAt: new Date(Date.now() + 86_400_000),
        status: 'ACTIVE',
      },
    });
    return { listingId, receiptId };
  }

  async function placedOffer(
    listingId: string,
    cookies: string[],
    rateBasisPoints: number,
  ): Promise<string> {
    const offer = await server()
      .post(`/api/v1/listings/${listingId}/offers`)
      .set('Cookie', cookies)
      .set('Idempotency-Key', randomUUID())
      .send({
        principal: amount('250000'),
        annualPercentageRateBasisPoints: rateBasisPoints,
        durationMs: 2_592_000_000,
        expiresAt: new Date(Date.now() + 3_600_000_000).toISOString(),
      })
      .expect(201);
    return offer.body.id;
  }

  it('creates exactly one loan when two acceptances race', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
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
      const borrower = await loginAs('borrower@orace.test', 'MEMBER');
      const lenderA = await fundedLender('a@orace.test', '250000');
      const lenderB = await fundedLender('b@orace.test', '250000');
      const { listingId } = await seededListing(round, borrower.accountId);
      const offerA = await placedOffer(listingId, lenderA.cookies, 1800);
      const offerB = await placedOffer(listingId, lenderB.cookies, 2000);

      const acceptFor = (offerId: string): ReturnType<AcceptOfferUseCase['execute']> =>
        acceptOffer.execute({
          listingId: listingIdOf(listingId),
          offerId: offerIdOf(offerId),
          requestedBy: accountIdOf(borrower.accountId),
        });
      const results = await Promise.all([acceptFor(offerA), acceptFor(offerB)]);

      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const rejected = results.find((result) => !result.ok);
      if (rejected !== undefined && !rejected.ok) {
        expect(rejected.error.code, `round ${round}`).toBe('LISTING_ALREADY_MATCHED');
      }
      expect(await harness.prisma.loan.count(), `round ${round}`).toBe(1);
      expect(await harness.prisma.lenderNote.count(), `round ${round}`).toBe(1);
      // The loser's hold survives the race untouched.
      expect(
        await harness.prisma.fundsHold.count({ where: { status: 'HELD' } }),
        `round ${round}`,
      ).toBe(1);
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 240_000);

  it('replays a duplicate acceptance instead of writing twice', async () => {
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
    const borrower = await loginAs('borrower@replay.test', 'MEMBER');
    const lender = await fundedLender('lender@replay.test', '250000');
    const { listingId } = await seededListing(999, borrower.accountId);
    const offerId = await placedOffer(listingId, lender.cookies, 1800);

    const key = randomUUID();
    const acceptRequest = (): Promise<request.Response> =>
      server()
        .post(`/api/v1/listings/${listingId}/offers/${offerId}/accept`)
        .set('Cookie', borrower.cookies)
        .set('Idempotency-Key', key)
        .send({})
        .then((response) => response);
    const [first, second] = await Promise.all([acceptRequest(), acceptRequest()]);

    const statuses = [first.status, second.status].sort();
    expect([...statuses]).toSatisfy(
      (observed: number[]) =>
        JSON.stringify(observed) === JSON.stringify([201, 201]) ||
        JSON.stringify(observed) === JSON.stringify([201, 409]),
    );
    if (statuses[1] === 201) {
      expect(first.body).toEqual(second.body);
    }
    expect(await harness.prisma.loan.count()).toBe(1);
    expect(
      await harness.prisma.ledgerTransaction.count({ where: { kind: 'ORIGINATE_LOAN' } }),
    ).toBe(1);
    await expectLedgerBalances(harness.prisma).toSumToZero();
  });
});
