import type { LoanResponse } from '@depawn/contracts';
import type { LoanReadModel } from '../../../domain/ports/loan-queries.port';
import { toMoneyDto, toSettlementRefDto } from '../../shared/http/money.mapper';

function isoOf(epochMilliseconds: bigint): string {
  return new Date(Number(epochMilliseconds)).toISOString();
}

export function toLoanResponse(readModel: LoanReadModel): LoanResponse {
  const { loan } = readModel;
  return {
    id: loan.id,
    receiptId: loan.receiptId,
    borrowerAccountId: loan.borrowerAccountId,
    principal: toMoneyDto(loan.principal),
    annualPercentageRateBasisPoints: loan.annualPercentageRateBasisPoints,
    startedAt: isoOf(loan.startedAt.epochMilliseconds),
    maturesAt: isoOf(loan.maturesAt.epochMilliseconds),
    graceEndsAt: isoOf(loan.graceEndsAt.epochMilliseconds),
    lenderNoteHolderAccountId: readModel.lenderNoteHolderAccountId,
    status: loan.status,
    originationSettlementRef: toSettlementRefDto(loan.originationSettlementRef),
  };
}
