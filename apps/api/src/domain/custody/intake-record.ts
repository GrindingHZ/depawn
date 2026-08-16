import type { AccountId, IntakeId, VaultId } from '../shared/identifiers';
import type { Money } from '../shared/money';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import type { Appraisal } from './appraisal';
import { DualAppraisalRequired } from './dual-appraisal-required';
import { hasSufficientAppraisals } from './dual-appraisal-policy';
import { IntakeAlreadySealed } from './intake-already-sealed';
import { IntakeIncomplete } from './intake-incomplete';
import { canonicalIntakeRecordHash } from './intake-record-hash';
import type { ItemCategory } from './item-category';

export type IntakeStatus = 'DRAFT' | 'SEALED';

export interface EvidenceItem {
  readonly label: string;
  readonly contentHash: string;
  /* Recorded at upload from the bytes themselves, so whatever serves the file
     back never has to guess and never has to trust the uploader. Absent on
     evidence written before photographs were verified. */
  readonly contentType?: string;
  readonly byteLength?: number;
}

interface IntakeRecordFields {
  readonly id: IntakeId;
  readonly vaultId: VaultId;
  readonly borrowerAccountId: AccountId;
  readonly itemCategory: ItemCategory;
  readonly itemDescription: string;
  readonly serialNumbers: readonly string[];
  readonly sealNumber: string | null;
  readonly evidence: readonly EvidenceItem[];
  readonly status: IntakeStatus;
  readonly sealedHash: string | null;
  readonly version: number;
}

export class IntakeRecord {
  private constructor(private readonly fields: IntakeRecordFields) {}

  get id(): IntakeId {
    return this.fields.id;
  }
  get vaultId(): VaultId {
    return this.fields.vaultId;
  }
  get borrowerAccountId(): AccountId {
    return this.fields.borrowerAccountId;
  }
  get itemCategory(): ItemCategory {
    return this.fields.itemCategory;
  }
  get itemDescription(): string {
    return this.fields.itemDescription;
  }
  get serialNumbers(): readonly string[] {
    return this.fields.serialNumbers;
  }
  get sealNumber(): string | null {
    return this.fields.sealNumber;
  }
  get evidence(): readonly EvidenceItem[] {
    return this.fields.evidence;
  }
  get status(): IntakeStatus {
    return this.fields.status;
  }
  get sealedHash(): string | null {
    return this.fields.sealedHash;
  }
  get version(): number {
    return this.fields.version;
  }

  get isSealed(): boolean {
    return this.fields.status === 'SEALED';
  }

  static begin(input: {
    id: IntakeId;
    vaultId: VaultId;
    borrowerAccountId: AccountId;
    itemCategory: ItemCategory;
    itemDescription: string;
  }): IntakeRecord {
    return new IntakeRecord({
      id: input.id,
      vaultId: input.vaultId,
      borrowerAccountId: input.borrowerAccountId,
      itemCategory: input.itemCategory,
      itemDescription: input.itemDescription,
      serialNumbers: [],
      sealNumber: null,
      evidence: [],
      status: 'DRAFT',
      sealedHash: null,
      version: 0,
    });
  }

  static restore(fields: IntakeRecordFields): IntakeRecord {
    return new IntakeRecord(fields);
  }

  describeItem(
    itemDescription: string,
    serialNumbers: readonly string[],
  ): Result<IntakeRecord, IntakeAlreadySealed> {
    if (this.isSealed) {
      return failure(new IntakeAlreadySealed());
    }
    return ok(
      new IntakeRecord({ ...this.fields, itemDescription, serialNumbers: [...serialNumbers] }),
    );
  }

  attachEvidence(items: readonly EvidenceItem[]): Result<IntakeRecord, IntakeAlreadySealed> {
    if (this.isSealed) {
      return failure(new IntakeAlreadySealed());
    }
    return ok(new IntakeRecord({ ...this.fields, evidence: [...this.fields.evidence, ...items] }));
  }

  recordSealNumber(sealNumber: string): Result<IntakeRecord, IntakeAlreadySealed> {
    if (this.isSealed) {
      return failure(new IntakeAlreadySealed());
    }
    return ok(new IntakeRecord({ ...this.fields, sealNumber }));
  }

  seal(
    appraisals: readonly Appraisal[],
    dualAppraisalThreshold: Money,
  ): Result<IntakeRecord, IntakeAlreadySealed | IntakeIncomplete | DualAppraisalRequired> {
    if (this.isSealed) {
      return failure(new IntakeAlreadySealed());
    }
    if (this.fields.evidence.length === 0) {
      return failure(new IntakeIncomplete('Attach at least one piece of evidence before sealing.'));
    }
    if (this.fields.sealNumber === null || this.fields.sealNumber === '') {
      return failure(new IntakeIncomplete('Record the physical seal number before sealing.'));
    }
    if (!hasSufficientAppraisals(appraisals, dualAppraisalThreshold)) {
      if (appraisals.length === 0) {
        return failure(new IntakeIncomplete('Record an appraisal before sealing.'));
      }
      return failure(new DualAppraisalRequired());
    }

    const sealedHash = canonicalIntakeRecordHash({
      id: this.fields.id,
      vaultId: this.fields.vaultId,
      borrowerAccountId: this.fields.borrowerAccountId,
      itemCategory: this.fields.itemCategory,
      itemDescription: this.fields.itemDescription,
      serialNumbers: this.fields.serialNumbers,
      sealNumber: this.fields.sealNumber,
      evidence: this.fields.evidence,
    });
    return ok(new IntakeRecord({ ...this.fields, status: 'SEALED', sealedHash }));
  }
}
