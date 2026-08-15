import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Appraisal } from '../src/domain/custody/appraisal';
import { IntakeRecord } from '../src/domain/custody/intake-record';
import { Vault } from '../src/domain/custody/vault';
import {
  accountIdOf,
  appraisalIdOf,
  intakeIdOf,
  staffIdOf,
  vaultIdOf,
} from '../src/domain/shared/identifiers';
import { Instant } from '../src/domain/shared/instant';
import { Money, currencyOf } from '../src/domain/shared/money';
import { PrismaUnitOfWork } from '../src/infrastructure/persistence/prisma-unit-of-work';
import { PrismaAppraisalRepository } from '../src/infrastructure/persistence/repositories/prisma-appraisal.repository';
import { PrismaIntakeRecordRepository } from '../src/infrastructure/persistence/repositories/prisma-intake-record.repository';
import { PrismaVaultRepository } from '../src/infrastructure/persistence/repositories/prisma-vault.repository';
import { IssueReceiptUseCase } from '../src/modules/custody/application/issue-receipt.use-case';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

const aud = currencyOf('AUD');
const vaultId = vaultIdOf('RACE-VAULT');
const raceRounds = 20;

describe('issue receipt race', () => {
  let harness: TestApplication;
  let unitOfWork: PrismaUnitOfWork;
  let useCase: IssueReceiptUseCase;
  let vaults: PrismaVaultRepository;
  let intakes: PrismaIntakeRecordRepository;
  let appraisals: PrismaAppraisalRepository;

  beforeAll(async () => {
    harness = await createTestApplication();
    unitOfWork = harness.app.get(PrismaUnitOfWork);
    useCase = harness.app.get(IssueReceiptUseCase);
    vaults = harness.app.get(PrismaVaultRepository);
    intakes = harness.app.get(PrismaIntakeRecordRepository);
    appraisals = harness.app.get(PrismaAppraisalRepository);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
  });

  /* Two sealed intakes worth 600 each against a limit of 1000: only one may
     issue. This is the concurrency proof the p2b review required for the
     vault lock. */
  async function seedSealedIntake(round: number, suffix: string): Promise<string> {
    const intakeId = intakeIdOf(`RACE-I-${round}-${suffix}`);
    return unitOfWork.run(async (context) => {
      const begun = IntakeRecord.begin({
        id: intakeId,
        vaultId,
        borrowerAccountId: accountIdOf(`RACE-B-${round}-${suffix}`),
        itemCategory: 'BULLION',
        itemDescription: 'Race bar',
      });
      const withEvidence = begun.attachEvidence([{ label: 'photo', contentHash: `h-${suffix}` }]);
      if (!withEvidence.ok) {
        throw new Error('setup failed');
      }
      const withSeal = withEvidence.value.recordSealNumber(`SEAL-${round}-${suffix}`);
      if (!withSeal.ok) {
        throw new Error('setup failed');
      }
      await intakes.save(withSeal.value, context);
      const appraisal = Appraisal.create({
        id: appraisalIdOf(`RACE-AP-${round}-${suffix}`),
        intakeId,
        appraiserId: staffIdOf('RACE-S1'),
        value: Money.of(600n, aud),
        method: 'spot',
        comparableReferences: '',
        appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
      });
      await appraisals.save(appraisal, context);
      const sealed = withSeal.value.seal([appraisal], Money.of(1_000_000n, aud));
      if (!sealed.ok) {
        throw new Error('setup failed');
      }
      await intakes.save(sealed.value, context);
      return intakeId;
    });
  }

  it('lets exactly one of two racing issuances under the insured limit', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      await harness.truncateAllTables();
      await unitOfWork.run((context) =>
        vaults.save(
          Vault.create({
            id: vaultId,
            name: 'Race vault',
            city: 'Sydney',
            insuredLimit: Money.of(1000n, aud),
          }),
          context,
        ),
      );
      const intakeA = await seedSealedIntake(round, 'a');
      const intakeB = await seedSealedIntake(round, 'b');

      const [resultA, resultB] = await Promise.all([
        useCase.execute({
          intakeId: intakeIdOf(intakeA),
          requestedBy: accountIdOf('RACE-STAFF'),
          insurancePolicyReference: 'POL-RACE',
        }),
        useCase.execute({
          intakeId: intakeIdOf(intakeB),
          requestedBy: accountIdOf('RACE-STAFF'),
          insurancePolicyReference: 'POL-RACE',
        }),
      ]);

      const succeeded = [resultA, resultB].filter((result) => result.ok);
      const rejected = [resultA, resultB].filter((result) => !result.ok);
      expect(succeeded, `round ${round}`).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      const rejection = rejected[0];
      if (rejection !== undefined && !rejection.ok) {
        expect(rejection.error.code).toBe('VAULT_INSURED_LIMIT_EXCEEDED');
      }
      expect(await harness.prisma.custodyReceipt.count()).toBe(1);
    }
  }, 240_000);

  it('issues one receipt when the same intake races itself', async () => {
    for (let round = 0; round < raceRounds; round += 1) {
      await harness.truncateAllTables();
      await unitOfWork.run((context) =>
        vaults.save(
          Vault.create({
            id: vaultId,
            name: 'Race vault',
            city: 'Sydney',
            insuredLimit: Money.of(1000n, aud),
          }),
          context,
        ),
      );
      const intakeId = await seedSealedIntake(round, 'same');

      const attempts = await Promise.allSettled([
        useCase.execute({
          intakeId: intakeIdOf(intakeId),
          requestedBy: accountIdOf('RACE-STAFF'),
          insurancePolicyReference: 'POL-RACE',
        }),
        useCase.execute({
          intakeId: intakeIdOf(intakeId),
          requestedBy: accountIdOf('RACE-STAFF'),
          insurancePolicyReference: 'POL-RACE',
        }),
      ]);

      // Both callers may succeed (the loser replays the winner's receipt
      // after the lock) or the loser may hit the unique index backstop; in
      // every outcome exactly one receipt exists.
      const receiptIds = attempts
        .filter((attempt) => attempt.status === 'fulfilled')
        .map((attempt) => (attempt.value.ok ? attempt.value.value.id : null))
        .filter((id) => id !== null);
      expect(receiptIds.length, `round ${round}`).toBeGreaterThanOrEqual(1);
      expect(new Set(receiptIds).size).toBe(1);
      expect(await harness.prisma.custodyReceipt.count()).toBe(1);
    }
  }, 240_000);
});
