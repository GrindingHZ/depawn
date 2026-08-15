import type { AppraisalResponse, IntakeResponse, ReceiptResponse } from '@depawn/contracts';
import type { Appraisal } from '../../../domain/custody/appraisal';
import type { CustodyReceipt } from '../../../domain/custody/custody-receipt';
import type { IntakeRecord } from '../../../domain/custody/intake-record';
import { toMoneyDto } from '../../shared/http/money.mapper';

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

export function toReceiptResponse(receipt: CustodyReceipt): ReceiptResponse {
  return {
    id: receipt.id,
    vaultId: receipt.vaultId,
    holderAccountId: receipt.holderAccountId,
    intakeRecordHash: receipt.intakeRecordHash,
    appraisedValue: toMoneyDto(receipt.appraisedValue),
    appraisedAt: new Date(Number(receipt.appraisedAt.epochMilliseconds)).toISOString(),
    itemCategory: receipt.itemCategory,
    insurancePolicyReference: receipt.insurancePolicyReference,
    status: receipt.status,
    encumberedByLoanId: receipt.encumberedByLoanId,
  };
}

const statusByCode: Record<string, number> = {
  NOT_FOUND: 404,
  INTAKE_ALREADY_SEALED: 409,
  INTAKE_NOT_SEALED: 409,
  INTAKE_INCOMPLETE: 422,
  DUAL_APPRAISAL_REQUIRED: 422,
  VAULT_INSURED_LIMIT_EXCEEDED: 422,
};

export function custodyStatusFor(code: string): number {
  return statusByCode[code] ?? 422;
}
