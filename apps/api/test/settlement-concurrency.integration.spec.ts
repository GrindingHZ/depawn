import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { platformAccountIds } from '../src/domain/ledger/platform-accounts';
import { accountIdOf } from '../src/domain/shared/identifiers';
import type { AccountId } from '../src/domain/shared/identifiers';
import { Money, currencyOf } from '../src/domain/shared/money';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { LedgerSettlementAdapter } from '../src/infrastructure/settlement/ledger-settlement.adapter';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';
import { expectLedgerBalances } from './ledger-assertions';

const aud = currencyOf('AUD');
const raceRounds = 20;

describe('settlement concurrency', () => {
  let harness: TestApplication;
  let adapter: LedgerSettlementAdapter;
  let unitOfWork: PrismaUnitOfWork;

  beforeAll(async () => {
    harness = await createTestApplication();
    adapter = harness.app.get(LedgerSettlementAdapter);
    unitOfWork = harness.app.get(PrismaUnitOfWork);
  });

  afterAll(async () => {
    await harness.close();
  });

  async function seedAccount(round: number, minorUnits: bigint): Promise<AccountId> {
    const accountId = accountIdOf(`RACE-${round}`);
    await unitOfWork.run((context) =>
      adapter.transfer(
        {
          fromAccountId: platformAccountIds.float,
          toAccountId: accountId,
          amount: Money.of(minorUnits + 1n, aud),
          reference: `race-seed-${round}`,
        },
        context,
      ),
    );
    // A tiny hold and refund provisions both ledger accounts up front so the
    // race exercises the balance row lock, not account creation.
    const warmup = await unitOfWork.run((context) =>
      adapter.hold(
        { accountId, amount: Money.of(1n, aud), reference: `race-warmup-${round}` },
        context,
      ),
    );
    await unitOfWork.run((context) => adapter.refundHold(warmup, context));
    await unitOfWork.run((context) =>
      adapter.transfer(
        {
          fromAccountId: accountId,
          toAccountId: platformAccountIds.float,
          amount: Money.of(1n, aud),
          reference: `race-trim-${round}`,
        },
        context,
      ),
    );
    return accountId;
  }

  it('allows exactly one of two racing holds when the balance covers one', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      const accountId = await seedAccount(round, 1000n);

      const attempts = await Promise.allSettled([
        unitOfWork.run((context) =>
          adapter.hold(
            { accountId, amount: Money.of(1000n, aud), reference: `race-a-${round}` },
            context,
          ),
        ),
        unitOfWork.run((context) =>
          adapter.hold(
            { accountId, amount: Money.of(1000n, aud), reference: `race-b-${round}` },
            context,
          ),
        ),
      ]);

      const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
      expect(fulfilled, `round ${round}`).toHaveLength(1);
      expect((await adapter.availableBalance(accountId, aud)).minorUnits).toBe(0n);
      await expectLedgerBalances(harness.prisma).toSumToZero();
    }
  }, 240_000);
});
