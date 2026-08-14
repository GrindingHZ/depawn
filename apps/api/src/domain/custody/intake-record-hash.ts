import { createHash } from 'node:crypto';
import type { EvidenceItem } from './intake-record';

export interface CanonicalIntakeFields {
  readonly id: string;
  readonly vaultId: string;
  readonly borrowerAccountId: string;
  readonly itemCategory: string;
  readonly itemDescription: string;
  readonly serialNumbers: readonly string[];
  readonly sealNumber: string;
  readonly evidence: readonly EvidenceItem[];
}

/* The hash commits the evidence bundle. Collections are sorted so the hash
   depends on content, not insertion order, and the field order is fixed here
   so a serialise and deserialise round trip reproduces it byte for byte. In
   Phase 3 this exact value goes on chain while the evidence stays off it. */
export function canonicalIntakeRecordHash(fields: CanonicalIntakeFields): string {
  const canonical = JSON.stringify({
    id: fields.id,
    vaultId: fields.vaultId,
    borrowerAccountId: fields.borrowerAccountId,
    itemCategory: fields.itemCategory,
    itemDescription: fields.itemDescription,
    serialNumbers: [...fields.serialNumbers].sort(),
    sealNumber: fields.sealNumber,
    evidence: [...fields.evidence]
      .sort((left, right) =>
        `${left.label}:${left.contentHash}`.localeCompare(`${right.label}:${right.contentHash}`),
      )
      .map((item) => ({ label: item.label, contentHash: item.contentHash })),
  });
  return createHash('sha256').update(canonical).digest('hex');
}
