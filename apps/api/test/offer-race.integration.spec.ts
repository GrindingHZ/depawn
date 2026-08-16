import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { platformAccountIds } from '../src/domain/ledger/platform-accounts';
import { accountIdOf, listingIdOf } from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { LedgerSettlementAdapter } from '../src/infrastructure/settlement/ledger-settlement.adapter';
import { PlaceOfferUseCase } from '../src/modules/marketplace/application/place-offer.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const aud = currencyOf('AUD');
const vaultId = 'VAULT-RACE-2';
const raceRounds = 20;

describe('offer race', () => {
  let harness: TestApplication;
  let unitOfWork: PrismaUnitOfWork;
  let placeOffer: PlaceOfferUseCase;
  let settlement: LedgerSettlementAdapter;

  beforeAll(async () => {
    harness = await createTestApplication();
    unitOfWork = harness.app.get(PrismaUnitOfWork);
    placeOffer = harness.app.get(PlaceOfferUseCase);
    settlement = harness.app.get(LedgerSettlementAdapter);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function seedListing(round: number, suffix: string): Promise<string> {
    const receiptId = `R-${round}-${suffix}`;
    const listingId = `L-${round}-${suffix}`;
    await harness.prisma.custodyReceipt.create({
      data: {
        id: receiptId,
        vaultId,
        holderAccountId: `B-${round}-${suffix}`,
        intakeRecordHash: `hash-${round}-${suffix}`,
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
    await harness.prisma.listing.create({
      data: {
        id: listingId,
        borrowerAccountId: `B-${round}-${suffix}`,
        receiptId,
        requestedPrincipalMinorUnits: 250_000n,
        currency: 'AUD',
        maxAnnualPercentageRateBasisPoints: 2400,
        requestedDurationMs: 2_592_000_000n,
        expiresAt: new Date(Number(harness.clock.now().epochMilliseconds) + 86_400_000),
        status: 'ACTIVE',
      },
    });
    return listingId;
  }

  it('holds funds once when two offers race one balance', async () => {
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
      const lender = accountIdOf(`RACE-LENDER-${round}`);
      await unitOfWork.run((context) =>
        settlement.transfer(
          {
            fromAccountId: platformAccountIds.float,
            toAccountId: lender,
            amount: Money.of(250_000n, aud),
            reference: `seed-${round}`,
          },
          context,
        ),
      );
      const listingA = await seedListing(round, 'a');
      const listingB = await seedListing(round, 'b');

      const expiresAt = Instant.fromEpochMilliseconds(
        harness.clock.now().epochMilliseconds + 86_400_000n,
      );
      const offerFor = (listingId: string): ReturnType<PlaceOfferUseCase['execute']> =>
        placeOffer.execute({
          listingId: listingIdOf(listingId),
          lenderAccountId: lender,
          principal: Money.of(250_000n, aud),
          annualPercentageRateBasisPoints: 1800,
          durationMs: 2_592_000_000n,
          expiresAt,
        });

      const results = await Promise.all([offerFor(listingA), offerFor(listingB)]);
      const succeeded = results.filter((result) => result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      const rejected = results.find((result) => !result.ok);
      if (rejected !== undefined && !rejected.ok) {
        expect(rejected.error.code).toBe('INSUFFICIENT_FUNDS');
      }
      expect(await harness.prisma.fundsHold.count()).toBe(1);
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 240_000);
});
