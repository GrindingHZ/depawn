import type { LoanResponse, PayoffQuoteResponse } from '@depawn/contracts';
import type { LoanReadModel } from '../../../domain/ports/loan-queries.port';
import type { PayoffQuote } from '../application/payoff-quote.query';
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

export function toPayoffQuoteResponse(quote: PayoffQuote): PayoffQuoteResponse {
  return {
    loanId: quote.loanId,
    principal: toMoneyDto(quote.principal),
    accruedInterest: toMoneyDto(quote.accruedInterest),
    total: toMoneyDto(quote.total),
    quotedAt: isoOf(quote.quotedAt.epochMilliseconds),
    validUntil: isoOf(quote.validUntil.epochMilliseconds),
  };
}
