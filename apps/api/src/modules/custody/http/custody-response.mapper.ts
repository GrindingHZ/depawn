import type {
  AppraisalResponse,
  IntakeResponse,
  ReceiptResponse,
  RedemptionRequestResponse,
} from '@depawn/contracts';
import type { Appraisal } from '../../../domain/custody/appraisal';
import type { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import type { RedemptionRequest } from '../../../domain/custody/redemption-request';
import type { Instant } from '../../../domain/shared/instant';
import { toMoneyDto } from '../../shared/http/money.mapper';

function isoOf(instant: Instant): string {
  return new Date(Number(instant.epochMilliseconds)).toISOString();
}

export function toAppraisalResponse(appraisal: Appraisal): AppraisalResponse {
  return {
    id: appraisal.id,
    appraiserId: appraisal.appraiserId,
    value: toMoneyDto(appraisal.value),
    method: appraisal.method,
    comparableReferences: appraisal.comparableReferences,
    appraisedAt: new Date(Number(appraisal.appraisedAt.epochMilliseconds)).toISOString(),
  };
}

export function toIntakeResponse(
  intake: IntakeRecord,
  appraisals: readonly Appraisal[],
): IntakeResponse {
  return {
    id: intake.id,
    vaultId: intake.vaultId,
    borrowerAccountId: intake.borrowerAccountId,
    itemCategory: intake.itemCategory,
    itemDescription: intake.itemDescription,
    serialNumbers: [...intake.serialNumbers],
    sealNumber: intake.sealNumber,
    evidence: intake.evidence.map((item) => ({
      label: item.label,
      contentHash: item.contentHash,
    })),
    status: intake.status,
    sealedHash: intake.sealedHash,
    appraisals: appraisals.map(toAppraisalResponse),
  };
}

export function toReceiptResponse(
  receipt: CustodyReceipt,
  hasPhotograph: boolean,
): ReceiptResponse {
  return {
    id: receipt.id,
    vaultId: receipt.vaultId,
    holderAccountId: receipt.holderAccountId,
    intakeRecordHash: receipt.intakeRecordHash,
    appraisedValue: toMoneyDto(receipt.appraisedValue),
    appraisedAt: new Date(Number(receipt.appraisedAt.epochMilliseconds)).toISOString(),
    itemCategory: receipt.itemCategory,
    itemDescription: receipt.itemDescription,
    hasPhotograph,
    insurancePolicyReference: receipt.insurancePolicyReference,
    status: receipt.status,
    encumberedByLoanId: receipt.encumberedByLoanId,
  };
}

export { domainErrorStatusFor as custodyStatusFor } from '../../shared/http/domain-error-status';

export function toRedemptionRequestResponse(request: RedemptionRequest): RedemptionRequestResponse {
  return {
    id: request.id,
    receiptId: request.receiptId,
    vaultId: request.vaultId,
    requestedByAccountId: request.requestedByAccountId,
    requestedAt: isoOf(request.requestedAt),
    status: request.status,
    verifiedAt: request.verifiedAt === null ? null : isoOf(request.verifiedAt),
    verifiedByStaffId: request.verifiedByStaffId,
    releasedAt: request.releasedAt === null ? null : isoOf(request.releasedAt),
    releasedByStaffId: request.releasedByStaffId,
    sealNumberBroken: request.sealNumberBroken,
  };
}
