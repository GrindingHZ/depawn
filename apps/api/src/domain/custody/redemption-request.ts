import type {
  AccountId,
  ReceiptId,
  RedemptionRequestId,
  StaffId,
  VaultId,
} from '../shared/identifiers';
import type { Instant } from '../shared/instant';
import { failure, ok } from '../shared/result';
import type { Result } from '../shared/result';
import { RedemptionAlreadyReleased } from './redemption-already-released';
import { RedemptionAlreadyVerified } from './redemption-already-verified';
import { RedemptionNotVerified } from './redemption-not-verified';

export type RedemptionStatus = 'REQUESTED' | 'VERIFIED' | 'RELEASED';

export type RedemptionEvent = 'verify' | 'release';

/* Verification and handover are separate events because in a dispute you
   need to know which of the two failed (docs/10-flows.md flow 6). */
export const allowedRedemptionTransitions: Record<RedemptionStatus, readonly RedemptionEvent[]> = {
  REQUESTED: ['verify'],
  VERIFIED: ['release'],
  RELEASED: [],
};

interface RedemptionRequestFields {
  readonly id: RedemptionRequestId;
  readonly receiptId: ReceiptId;
  readonly vaultId: VaultId;
  readonly requestedByAccountId: AccountId;
  readonly requestedAt: Instant;
  readonly status: RedemptionStatus;
  readonly verifiedAt: Instant | null;
  readonly verifiedByStaffId: StaffId | null;
  readonly releasedAt: Instant | null;
  readonly releasedByStaffId: StaffId | null;
  readonly sealNumberBroken: string | null;
}

export type RedemptionRejected =
  RedemptionNotVerified | RedemptionAlreadyVerified | RedemptionAlreadyReleased;

export class RedemptionRequest {
  private constructor(private readonly fields: RedemptionRequestFields) {}

  get id(): RedemptionRequestId {
    return this.fields.id;
  }
  get receiptId(): ReceiptId {
    return this.fields.receiptId;
  }
  get vaultId(): VaultId {
    return this.fields.vaultId;
  }
  get requestedByAccountId(): AccountId {
    return this.fields.requestedByAccountId;
  }
  get requestedAt(): Instant {
    return this.fields.requestedAt;
  }
  get status(): RedemptionStatus {
    return this.fields.status;
  }
  get verifiedAt(): Instant | null {
    return this.fields.verifiedAt;
  }
  get verifiedByStaffId(): StaffId | null {
    return this.fields.verifiedByStaffId;
  }
  get releasedAt(): Instant | null {
    return this.fields.releasedAt;
  }
  get releasedByStaffId(): StaffId | null {
    return this.fields.releasedByStaffId;
  }
  get sealNumberBroken(): string | null {
    return this.fields.sealNumberBroken;
  }

  static open(input: {
    readonly id: RedemptionRequestId;
    readonly receiptId: ReceiptId;
    readonly vaultId: VaultId;
    readonly requestedByAccountId: AccountId;
    readonly requestedAt: Instant;
  }): RedemptionRequest {
    return new RedemptionRequest({
      ...input,
      status: 'REQUESTED',
      verifiedAt: null,
      verifiedByStaffId: null,
      releasedAt: null,
      releasedByStaffId: null,
      sealNumberBroken: null,
    });
  }

  static restore(fields: RedemptionRequestFields): RedemptionRequest {
    return new RedemptionRequest(fields);
  }

  verify(staffId: StaffId, at: Instant): Result<RedemptionRequest, RedemptionRejected> {
    if (!this.allows('verify')) {
      return failure(
        this.fields.status === 'RELEASED'
          ? new RedemptionAlreadyReleased()
          : new RedemptionAlreadyVerified(),
      );
    }
    return ok(
      new RedemptionRequest({
        ...this.fields,
        status: 'VERIFIED',
        verifiedAt: at,
        verifiedByStaffId: staffId,
      }),
    );
  }

  release(
    staffId: StaffId,
    sealNumberBroken: string,
    at: Instant,
  ): Result<RedemptionRequest, RedemptionRejected> {
    if (!this.allows('release')) {
      return failure(
        this.fields.status === 'RELEASED'
          ? new RedemptionAlreadyReleased()
          : new RedemptionNotVerified(),
      );
    }
    return ok(
      new RedemptionRequest({
        ...this.fields,
        status: 'RELEASED',
        releasedAt: at,
        releasedByStaffId: staffId,
        sealNumberBroken,
      }),
    );
  }

  allows(event: RedemptionEvent): boolean {
    return allowedRedemptionTransitions[this.fields.status].includes(event);
  }
}
