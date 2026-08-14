import { describe, expect, it } from 'vitest';
import {
  accountIdOf,
  appraisalIdOf,
  intakeIdOf,
  staffIdOf,
  vaultIdOf,
} from '../shared/identifiers';
import { Instant } from '../shared/instant';
import { Money, currencyOf } from '../shared/money';
import { Appraisal } from './appraisal';
import { IntakeRecord } from './intake-record';
import { canonicalIntakeRecordHash } from './intake-record-hash';

const aud = currencyOf('AUD');
const threshold = Money.of(1_000_000n, aud);

function draftIntake(): IntakeRecord {
  const begun = IntakeRecord.begin({
    id: intakeIdOf('I1'),
    vaultId: vaultIdOf('V1'),
    borrowerAccountId: accountIdOf('A1'),
    itemCategory: 'BULLION',
    itemDescription: 'One kilogram gold bar',
  });
  const withEvidence = begun.attachEvidence([
    { label: 'front photo', contentHash: 'hash-front' },
    { label: 'assay certificate', contentHash: 'hash-assay' },
  ]);
  if (!withEvidence.ok) {
    throw new Error('draft setup failed');
  }
  const withSeal = withEvidence.value.recordSealNumber('SEAL-042');
  if (!withSeal.ok) {
    throw new Error('draft setup failed');
  }
  return withSeal.value;
}

function appraisalOf(value: bigint, appraiser: string): Appraisal {
  return Appraisal.create({
    id: appraisalIdOf(`AP-${appraiser}-${value}`),
    intakeId: intakeIdOf('I1'),
    appraiserId: staffIdOf(appraiser),
    value: Money.of(value, aud),
    method: 'spot price times weight',
    comparableReferences: 'LBMA fix',
    appraisedAt: Instant.fromEpochMilliseconds(1_700_000_000_000n),
  });
}

describe('IntakeRecord', () => {
  it('seals with one appraisal below the dual threshold', () => {
    const sealed = draftIntake().seal([appraisalOf(500_000n, 'S1')], threshold);
    expect(sealed.ok).toBe(true);
    if (sealed.ok) {
      expect(sealed.value.isSealed).toBe(true);
      expect(sealed.value.sealedHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('requires two distinct appraisers at or above the threshold', () => {
    const single = draftIntake().seal([appraisalOf(1_000_000n, 'S1')], threshold);
    expect(single.ok).toBe(false);
    if (!single.ok) {
      expect(single.error.code).toBe('DUAL_APPRAISAL_REQUIRED');
    }

    const samePerson = draftIntake().seal(
      [appraisalOf(1_000_000n, 'S1'), appraisalOf(1_100_000n, 'S1')],
      threshold,
    );
    expect(samePerson.ok).toBe(false);

    const dual = draftIntake().seal(
      [appraisalOf(1_000_000n, 'S1'), appraisalOf(1_100_000n, 'S2')],
      threshold,
    );
    expect(dual.ok).toBe(true);
  });

  it('rejects sealing without evidence a seal number or an appraisal', () => {
    const bare = IntakeRecord.begin({
      id: intakeIdOf('I2'),
      vaultId: vaultIdOf('V1'),
      borrowerAccountId: accountIdOf('A1'),
      itemCategory: 'BULLION',
      itemDescription: 'Bar',
    });
    const noEvidence = bare.seal([appraisalOf(1n, 'S1')], threshold);
    expect(noEvidence.ok).toBe(false);

    const noAppraisal = draftIntake().seal([], threshold);
    expect(noAppraisal.ok).toBe(false);
    if (!noAppraisal.ok) {
      expect(noAppraisal.error.code).toBe('INTAKE_INCOMPLETE');
    }
  });

  it('is irreversible: every write after sealing is rejected', () => {
    const sealed = draftIntake().seal([appraisalOf(1n, 'S1')], threshold);
    expect(sealed.ok).toBe(true);
    if (!sealed.ok) {
      return;
    }
    const record = sealed.value;
    expect(record.describeItem('changed', []).ok).toBe(false);
    expect(record.attachEvidence([{ label: 'late', contentHash: 'x' }]).ok).toBe(false);
    expect(record.recordSealNumber('SEAL-999').ok).toBe(false);
    expect(record.seal([appraisalOf(1n, 'S1')], threshold).ok).toBe(false);
  });
});

describe('canonicalIntakeRecordHash', () => {
  const baseFields = {
    id: 'I1',
    vaultId: 'V1',
    borrowerAccountId: 'A1',
    itemCategory: 'BULLION',
    itemDescription: 'One kilogram gold bar',
    serialNumbers: ['SN-2', 'SN-1'],
    sealNumber: 'SEAL-042',
    evidence: [
      { label: 'front photo', contentHash: 'hash-front' },
      { label: 'assay certificate', contentHash: 'hash-assay' },
    ],
  };

  it('is stable across a serialise and deserialise round trip', () => {
    const original = canonicalIntakeRecordHash(baseFields);
    const roundTripped = canonicalIntakeRecordHash(
      JSON.parse(JSON.stringify(baseFields)) as typeof baseFields,
    );
    expect(roundTripped).toBe(original);
  });

  it('ignores collection ordering but not content', () => {
    const reordered = canonicalIntakeRecordHash({
      ...baseFields,
      serialNumbers: ['SN-1', 'SN-2'],
      evidence: [...baseFields.evidence].reverse(),
    });
    expect(reordered).toBe(canonicalIntakeRecordHash(baseFields));

    const changed = canonicalIntakeRecordHash({
      ...baseFields,
      itemDescription: 'A different bar',
    });
    expect(changed).not.toBe(canonicalIntakeRecordHash(baseFields));
  });
});
