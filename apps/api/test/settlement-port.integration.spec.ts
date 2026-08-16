import { describeSettlementPortContract } from '@depawn/test-support';
import { afterEach } from 'vitest';
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
let harness: TestApplication | undefined;
let accountCounter = 0;

afterEach(async () => {
  if (harness !== undefined) {
    await expectLedgerBalances(harness.prisma).toSumToZero();
  }
});

describeSettlementPortContract('ledger', async () => {
  harness = await createTestApplication();
  const activeHarness = harness;
  const adapter = activeHarness.app.get(LedgerSettlementAdapter);
  const unitOfWork = activeHarness.app.get(PrismaUnitOfWork);

  async function heldBalanceOf(accountId: AccountId): Promise<bigint> {
    const rows = await activeHarness.prisma.$queryRaw<{ balance: bigint }[]>`
      SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.minor_units ELSE -e.minor_units END), 0)::bigint AS balance
      FROM ledger_entry e
      JOIN ledger_account a ON a.id = e.account_id
      WHERE a.owner_id = ${accountId} AND a.purpose = 'USER_HELD'
    `;
    return rows[0]?.balance ?? 0n;
  }

  return {
    port: adapter,
    runInUnitOfWork: (work) => unitOfWork.run(work),
    async createAccountWithBalance(minorUnits: bigint): Promise<AccountId> {
      accountCounter += 1;
      const accountId = accountIdOf(`CONTRACT-${accountCounter}`);
      if (minorUnits > 0n) {
        await unitOfWork.run((context) =>
          adapter.transfer(
            {
              fromAccountId: platformAccountIds.float,
              toAccountId: accountId,
              amount: Money.of(minorUnits, aud),
              reference: `seed-${accountCounter}`,
            },
            context,
          ),
        );
      }
      return accountId;
    },
    async availableBalanceOf(accountId: AccountId): Promise<bigint> {
      return (await adapter.availableBalance(accountId, aud)).minorUnits;
    },
    heldBalanceOf,
    async referenceExists(settlementRef): Promise<boolean> {
      const row = await activeHarness.prisma.ledgerTransaction.findUnique({
        where: { id: settlementRef.reference },
      });
      return row !== null;
    },
    async transactionKindOf(reference): Promise<string> {
      const row = await activeHarness.prisma.ledgerTransaction.findUnique({
        where: { id: reference },
      });
      if (row === null) {
        throw new Error(`No ledger transaction ${reference}`);
      }
      return row.kind;
    },
    close: () => activeHarness.close(),
  };
});
