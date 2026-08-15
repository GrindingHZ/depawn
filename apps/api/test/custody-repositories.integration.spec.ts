import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Appraisal } from '../src/domain/custody/appraisal';
import { IntakeRecord } from '../src/domain/custody/intake-record';
import { Vault } from '../src/domain/custody/vault';
import {
  accountIdOf,
  appraisalIdOf,
  intakeIdOf,
  loanIdOf,
  receiptIdOf,
  staffIdOf,
  vaultIdOf,
} from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { DatabaseCustodyAdapter } from '../src/infrastructure/custody/database-custody.adapter';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { PrismaAppraisalRepository } from '../src/infrastructure/persistence/repositories/prisma-appraisal.repository';
import {
  PrismaCustodyReceiptRepository,
  StaleReceiptVersionError,
} from '../src/infrastructure/persistence/repositories/prisma-custody-receipt.repository';
import { PrismaIntakeRecordRepository } from '../src/infrastructure/persistence/repositories/prisma-intake-record.repository';
import { PrismaVaultRepository } from '../src/infrastructure/persistence/repositories/prisma-vault.repository';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const aud = currencyOf('AUD');
const vaultId = vaultIdOf('REPO-VAULT');

describe('custody repositories', () => {
  let harness: TestApplication;
  let unitOfWork: PrismaUnitOfWork;
  let vaults: PrismaVaultRepository;
  let intakes: PrismaIntakeRecordRepository;
  let appraisals: PrismaAppraisalRepository;
  let receipts: PrismaCustodyReceiptRepository;
  let adapter: DatabaseCustodyAdapter;

  beforeAll(async () => {
    harness = await createTestApplication();
    unitOfWork = harness.app.get(PrismaUnitOfWork);
    vaults = harness.app.get(PrismaVaultRepository);
    intakes = harness.app.get(PrismaIntakeRecordRepository);
    appraisals = harness.app.get(PrismaAppraisalRepository);
    receipts = harness.app.get(PrismaCustodyReceiptRepository);
    adapter = harness.app.get(DatabaseCustodyAdapter);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    await unitOfWork.run((context) =>
      vaults.save(
        Vault.create({
          id: vaultId,
          name: 'Repo vault',
          city: 'Sydney',
          insuredLimit: Money.of(10_000_000n, aud),
        }),
        context,
      ),
    );
  });

  it('round trips an intake through drafting sealing and reload', async () => {
    const begun = IntakeRecord.begin({
      id: intakeIdOf('REPO-I1'),
      vaultId,
      borrowerAccountId: accountIdOf('REPO-B1'),
      itemCategory: 'BULLION',
      itemDescription: 'One kilogram gold bar',
    });
    await unitOfWork.run((context) => intakes.save(begun, context));

    const loaded = await unitOfWork.run((context) =>
      intakes.findById(intakeIdOf('REPO-I1'), context),
    );
    expect(loaded).not.toBeNull();
    if (loaded === null) {
      return;
    }

    const withEvidence = loaded.attachEvidence([{ label: 'front photo', contentHash: 'h1' }]);
    expect(withEvidence.ok).toBe(true);
    if (!withEvidence.ok) {
      return;
    }
    const withSeal = withEvidence.value.recordSealNumber('SEAL-1');
    expect(withSeal.ok).toBe(true);
    if (!withSeal.ok) {
      return;
    }

    const appraisal = Appraisal.create({
      id: appraisalIdOf('REPO-AP1'),
      intakeId: intakeIdOf('REPO-I1'),
      appraiserId: staffIdOf('REPO-S1'),
      value: Money.of(500_000n, aud),
      method: 'spot times weight',
      comparableReferences: 'LBMA',
      appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
    });
    await unitOfWork.run((context) => appraisals.save(appraisal, context));
    const listed = await unitOfWork.run((context) =>
      appraisals.listByIntake(intakeIdOf('REPO-I1'), context),
    );
    expect(listed).toHaveLength(1);
    expect(listed[0]?.value.minorUnits).toBe(500_000n);

    const sealed = withSeal.value.seal(listed, Money.of(1_000_000n, aud));
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) {
      return;
    }
    await unitOfWork.run((context) => intakes.save(sealed.value, context));

    const reloaded = await unitOfWork.run((context) =>
      intakes.findById(intakeIdOf('REPO-I1'), context),
    );
    expect(reloaded?.isSealed).toBe(true);
    expect(reloaded?.sealedHash).toBe(sealed.value.sealedHash);
    expect(reloaded?.evidence).toEqual([{ label: 'front photo', contentHash: 'h1' }]);
    expect(reloaded?.version).toBe(1);
  });

  it('rejects a stale receipt save', async () => {
    const issued = await unitOfWork.run((context) =>
      adapter.issueReceipt(
        {
          vaultId,
          holderAccountId: accountIdOf('REPO-B2'),
          intakeRecordHash: 'hash-2',
          appraisedValue: Money.of(100_000n, aud),
          appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
          appraiserId: staffIdOf('REPO-S1'),
          itemCategory: 'BULLION',
          insurancePolicyReference: 'POL-1',
        },
        context,
      ),
    );

    const staleCopy = issued;
    await unitOfWork.run((context) =>
      adapter.encumberReceipt(issued.id, loanIdOf('REPO-L1'), context),
    );

    const transferAttempt = staleCopy.transferHolder(accountIdOf('REPO-B3'));
    if (transferAttempt.ok) {
      await expect(
        unitOfWork.run((context) => receipts.save(transferAttempt.value, context)),
      ).rejects.toThrow(StaleReceiptVersionError);
    }
  });

  it('sums exposure over live receipts only', async () => {
    async function issueWorth(minorUnits: bigint, suffix: string): Promise<string> {
      const receipt = await unitOfWork.run((context) =>
        adapter.issueReceipt(
          {
            vaultId,
            holderAccountId: accountIdOf(`REPO-B-${suffix}`),
            intakeRecordHash: `hash-${suffix}`,
            appraisedValue: Money.of(minorUnits, aud),
            appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
            appraiserId: staffIdOf('REPO-S1'),
            itemCategory: 'BULLION',
            insurancePolicyReference: 'POL-1',
          },
          context,
        ),
      );
      return receipt.id;
    }

    const first = await issueWorth(300_000n, 'x');
    await issueWorth(200_000n, 'y');
    const third = await issueWorth(150_000n, 'z');

    await unitOfWork.run((context) =>
      // Encumbered receipts stay in exposure (rule C5).
      adapter.encumberReceipt(receiptIdOf(first), loanIdOf('REPO-L2'), context),
    );
    await unitOfWork.run((context) =>
      adapter.burnReceipt(receiptIdOf(third), 'REDEMPTION', context),
    );

    const exposure = await unitOfWork.run((context) => receipts.exposureOf(vaultId, aud, context));
    expect(exposure.minorUnits).toBe(500_000n);
  });
});
