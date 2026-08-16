import type {
  Appraisal as AppraisalRow,
  CustodyReceipt as CustodyReceiptRow,
  IntakeRecord as IntakeRecordRow,
  Vault as VaultRow,
} from '@prisma/client';
import { Appraisal } from '../../../domain/custody/appraisal';
import { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import { IntakeRecord } from '../../../domain/custody/intake-record';
import type { EvidenceItem } from '../../../domain/custody/intake-record';
import { Vault } from '../../../domain/custody/vault';
import {
  accountIdOf,
  appraisalIdOf,
  intakeIdOf,
  loanIdOf,
  receiptIdOf,
  staffIdOf,
  vaultIdOf,
} from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';
import { Money, currencyOf } from '../../../domain/shared/money';

function instantOf(value: Date): Instant {
  return Instant.fromEpochMilliseconds(BigInt(value.getTime()));
}

export function toVault(row: VaultRow): Vault {
  return Vault.restore({
    id: vaultIdOf(row.id),
    name: row.name,
    city: row.city,
    insuredLimit: Money.of(row.insuredLimitMinorUnits, currencyOf(row.currency)),
    version: row.version,
  });
}

export function toEvidenceItems(value: unknown): EvidenceItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: EvidenceItem[] = [];
  for (const entry of value) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'label' in entry &&
      typeof entry.label === 'string' &&
      'contentHash' in entry &&
      typeof entry.contentHash === 'string'
    ) {
      /* Read back only what was written. Evidence recorded before uploads
         were verified carries no type, and the media endpoint treats that as
         a reason to refuse rather than a reason to guess. */
      const contentType =
        'contentType' in entry && typeof entry.contentType === 'string'
          ? entry.contentType
          : undefined;
      const byteLength =
        'byteLength' in entry && typeof entry.byteLength === 'number'
          ? entry.byteLength
          : undefined;
      items.push({
        label: entry.label,
        contentHash: entry.contentHash,
        ...(contentType === undefined ? {} : { contentType }),
        ...(byteLength === undefined ? {} : { byteLength }),
      });
    }
  }
  return items;
}

export function toIntakeRecord(row: IntakeRecordRow): IntakeRecord {
  return IntakeRecord.restore({
    id: intakeIdOf(row.id),
    vaultId: vaultIdOf(row.vaultId),
    borrowerAccountId: accountIdOf(row.borrowerAccountId),
    itemCategory: row.itemCategory,
    itemDescription: row.itemDescription,
    serialNumbers: row.serialNumbers,
    sealNumber: row.sealNumber,
    evidence: toEvidenceItems(row.evidence),
    status: row.status,
    sealedHash: row.sealedHash,
    version: row.version,
  });
}

export function toAppraisal(row: AppraisalRow): Appraisal {
  return Appraisal.restore({
    id: appraisalIdOf(row.id),
    intakeId: intakeIdOf(row.intakeId),
    appraiserId: staffIdOf(row.appraiserId),
    value: Money.of(row.valueMinorUnits, currencyOf(row.currency)),
    method: row.method,
    comparableReferences: row.comparableReferences,
    appraisedAt: instantOf(row.appraisedAt),
  });
}

export function toCustodyReceipt(row: CustodyReceiptRow): CustodyReceipt {
  return CustodyReceipt.restore({
    id: receiptIdOf(row.id),
    vaultId: vaultIdOf(row.vaultId),
    holderAccountId: accountIdOf(row.holderAccountId),
    intakeRecordHash: row.intakeRecordHash,
    appraisedValue: Money.of(row.appraisedValueMinorUnits, currencyOf(row.currency)),
    appraisedAt: instantOf(row.appraisedAt),
    appraiserId: staffIdOf(row.appraiserId),
    itemCategory: row.itemCategory,
    insurancePolicyReference: row.insurancePolicyReference,
    status: row.status,
    encumberedByLoanId: row.encumberedByLoanId === null ? null : loanIdOf(row.encumberedByLoanId),
    version: row.version,
  });
}
