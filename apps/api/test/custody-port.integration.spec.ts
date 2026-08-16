import { describeCustodyPortContract } from '@depawn/test-support';
import { Vault } from '../src/domain/custody/vault';
import type { IssueReceiptCommand } from '../src/domain/ports/custody.port';
import { accountIdOf, receiptIdOf, staffIdOf, vaultIdOf } from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { DatabaseCustodyAdapter } from '../src/infrastructure/custody/database-custody.adapter';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { PrismaCustodyReceiptRepository } from '../src/infrastructure/persistence/repositories/prisma-custody-receipt.repository';
import { PrismaVaultRepository } from '../src/infrastructure/persistence/repositories/prisma-vault.repository';
import { createTestApplication } from './create-test-application';

const aud = currencyOf('AUD');
let commandCounter = 0;

describeCustodyPortContract('database', async () => {
  const harness = await createTestApplication();
  const adapter = harness.app.get(DatabaseCustodyAdapter);
  const unitOfWork = harness.app.get(PrismaUnitOfWork);
  const receipts = harness.app.get(PrismaCustodyReceiptRepository);
  const vaults = harness.app.get(PrismaVaultRepository);

  const vaultId = vaultIdOf('CONTRACT-VAULT');
  await unitOfWork.run((context) =>
    vaults.save(
      Vault.create({
        id: vaultId,
        name: 'Contract vault',
        city: 'Sydney',
        insuredLimit: Money.of(100_000_000n, aud),
      }),
      context,
    ),
  );

  return {
    port: adapter,
    runInUnitOfWork: (work) => unitOfWork.run(work),
    nextIssueCommand(): IssueReceiptCommand {
      commandCounter += 1;
      return {
        vaultId,
        holderAccountId: accountIdOf(`CONTRACT-BORROWER-${commandCounter}`),
        intakeRecordHash: `hash-${commandCounter}`,
        appraisedValue: Money.of(500_000n, aud),
        appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
        appraiserId: staffIdOf('CONTRACT-APPRAISER'),
        itemCategory: 'BULLION',
        itemDescription: 'One kilogram gold bar, cast',
        insurancePolicyReference: 'POL-CONTRACT',
      };
    },
    receiptById: (id) => unitOfWork.run((context) => receipts.findById(receiptIdOf(id), context)),
    close: () => harness.close(),
  };
});
