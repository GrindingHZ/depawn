import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { accountIdOf, liquidationIdOf } from '../src/domain/shared/identifiers';
import { Money, currencyOf } from '../src/domain/shared/money';
import { CloseLiquidationUseCase } from '../src/modules/lending/application/close-liquidation.use-case';
import { PlaceBidUseCase } from '../src/modules/lending/application/place-bid.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const aud = currencyOf('AUD');
const vaultId = 'VAULT-LRACE-1';
const password = 'a-long-enough-password';
const oneDay = 24n * 60n * 60n * 1000n;
const raceRounds = 20;
const amount = (minorUnits: string): { minorUnits: string; currency: 'AUD' } => ({
  minorUnits,
  currency: 'AUD',
});

describe('liquidation races', () => {
  let harness: TestApplication;
  let placeBid: PlaceBidUseCase;
  let closeLiquidation: CloseLiquidationUseCase;

  beforeAll(async () => {
    harness = await createTestApplication();
    placeBid = harness.app.get(PlaceBidUseCase);
    closeLiquidation = harness.app.get(CloseLiquidationUseCase);
  });

  afterAll(async () => {
    await harness.close();
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

  async function signInAgain(party: Party): Promise<void> {
    const login = await server()
      .post('/api/v1/auth/login')
      .send({ email: party.email, password })
      .expect(200);
    party.cookies = login.get('Set-Cookie') ?? [];
  }

  interface OpenSale {
    readonly liquidationId: string;
    readonly bidders: readonly Party[];
  }

  async function openSale(round: number): Promise<OpenSale> {
    await harness.truncateAllTables();
    await harness.prisma.vault.create({
      data: {
        id: vaultId,
        name: 'Race vault',
        city: 'Sydney',
        insuredLimitMinorUnits: 1_000_000_000n,
        currency: 'AUD',
      },
    });
    const borrower = await loginAs(`borrower-${round}@lrace.test`, 'MEMBER');
    const lender = await loginAs(`lender-${round}@lrace.test`, 'MEMBER');
    const ops = await loginAs(`ops-${round}@lrace.test`, 'OPERATIONS');
    await server()
      .post('/api/v1/me/deposits')
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ email: lender.email, amount: amount('250000') })
      .expect(201);

    const receiptId = `R-LRACE-${round}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: borrower.accountId,
        intakeRecordHash: `hash-lrace-${round}`,
        appraisedValueMinorUnits: 500_000n,
        currency: 'AUD',
        appraisedAt: new Date(0),
        appraiserId: 'S1',
        itemCategory: 'BULLION',
        insurancePolicyReference: 'POL-1',
        status: 'IN_VAULT',
      },
    });
    const listingId = `L-LRACE-${round}`;
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

    harness.clock.advanceBy(30n * oneDay + 7n * oneDay + oneDay);
    await signInAgain(lender);
    await server()
      .post(`/api/v1/loans/${accepted.body.id}/default`)
      .set('Cookie', lender.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);

    harness.clock.advanceBy(31n * oneDay);
    await signInAgain(ops);
    const scheduled = await server()
      .post(`/api/v1/loans/${accepted.body.id}/liquidations`)
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ reservePrice: amount('200000') })
      .expect(201);
    await server()
      .post(`/api/v1/liquidations/${scheduled.body.id}/open`)
      .set('Cookie', ops.cookies)
      .set('Idempotency-Key', randomUUID())
      .send({ biddingWindowMs: Number(7n * oneDay) })
      .expect(201);

    const bidders: Party[] = [];
    for (const label of ['a', 'b']) {
      const bidder = await loginAs(`bidder-${label}-${round}@lrace.test`, 'MEMBER');
      await server()
        .post('/api/v1/me/deposits')
        .set('Cookie', ops.cookies)
        .set('Idempotency-Key', randomUUID())
        .send({ email: bidder.email, amount: amount('400000') })
        .expect(201);
      bidders.push(bidder);
    }
    return { liquidationId: scheduled.body.id, bidders };
  }

  it('accepts one of two bids racing the same amount', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      const sale = await openSale(round);
      const bidOnce = (bidder: Party): ReturnType<PlaceBidUseCase['execute']> =>
        placeBid.execute({
          liquidationId: liquidationIdOf(sale.liquidationId),
          bidderAccountId: accountIdOf(bidder.accountId),
          amount: Money.of(250_000n, aud),
        });
      const bidders = sale.bidders;
      const results = await Promise.all([bidOnce(bidders[0]!), bidOnce(bidders[1]!)]);

      // Equal bids cannot both stand: the second to arrive does not beat the
      // first, so exactly one is on the book.
      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      expect(await harness.prisma.liquidationBid.count(), `round ${round}`).toBe(1);
      expect(
        await harness.prisma.fundsHold.count({ where: { status: 'HELD' } }),
        `round ${round}`,
      ).toBe(1);
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 400_000);

  it('settles once when two closes race', async () => {
    for (let round = 100; round < 100 + raceRounds; round += 1) {
      const sale = await openSale(round);
      const bidder = sale.bidders[0];
      if (bidder === undefined) {
        throw new Error('the sale must have a bidder');
      }
      const placed = await placeBid.execute({
        liquidationId: liquidationIdOf(sale.liquidationId),
        bidderAccountId: accountIdOf(bidder.accountId),
        amount: Money.of(300_000n, aud),
      });
      expect(placed.ok, `round ${round}`).toBe(true);

      const closeOnce = (): ReturnType<CloseLiquidationUseCase['execute']> =>
        closeLiquidation.execute({
          liquidationId: liquidationIdOf(sale.liquidationId),
          requestedBy: accountIdOf(bidder.accountId),
        });
      const results = await Promise.all([closeOnce(), closeOnce()]);

      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      expect(
        await harness.prisma.ledgerTransaction.count({ where: { kind: 'SETTLE_LIQUIDATION' } }),
        `round ${round}`,
      ).toBe(1);
      const row = await harness.prisma.liquidation.findUnique({
        where: { id: sale.liquidationId },
      });
      expect(row?.status, `round ${round}`).toBe('SETTLED');
      expect(
        await harness.prisma.loan.count({ where: { status: 'LIQUIDATED' } }),
        `round ${round}`,
      ).toBe(1);
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 400_000);
});
