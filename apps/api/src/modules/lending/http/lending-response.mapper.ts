import type { LiquidationResponse, LoanResponse, PayoffQuoteResponse } from '@depawn/contracts';
import type { Liquidation } from '../../../domain/lending/liquidation';
import type { LoanReadModel } from '../../../domain/ports/loan-queries.port';
import type { PayoffQuote } from '../application/payoff-quote.query';
import { toMoneyDto, toSettlementRefDto } from '../../shared/http/money.mapper';

export function isoOf(instant: { readonly epochMilliseconds: bigint }): string {
  return new Date(Number(instant.epochMilliseconds)).toISOString();
}

export function toLoanResponse(readModel: LoanReadModel): LoanResponse {
  const { loan } = readModel;
  return {
    id: loan.id,
    receiptId: loan.receiptId,
    itemDescription: readModel.itemDescription,
    borrowerAccountId: loan.borrowerAccountId,
    principal: toMoneyDto(loan.principal),
    annualPercentageRateBasisPoints: loan.annualPercentageRateBasisPoints,
    startedAt: isoOf(loan.startedAt),
    maturesAt: isoOf(loan.maturesAt),
    graceEndsAt: isoOf(loan.graceEndsAt),
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
    quotedAt: isoOf(quote.quotedAt),
    validUntil: isoOf(quote.validUntil),
  };
}

export function toLiquidationResponse(liquidation: Liquidation): LiquidationResponse {
  const highest = liquidation.highestBid();
  return {
    id: liquidation.id,
    loanId: liquidation.loanId,
    receiptId: liquidation.receiptId,
    reservePrice: toMoneyDto(liquidation.reservePrice),
    status: liquidation.status,
    opensAt: liquidation.opensAt === null ? null : isoOf(liquidation.opensAt),
    closesAt: liquidation.closesAt === null ? null : isoOf(liquidation.closesAt),
    winningBidId: liquidation.winningBidId,
    highestBid: highest === null ? null : toMoneyDto(highest.amount),
    bids: liquidation.bids.map((bid) => ({
      id: bid.id,
      bidderAccountId: bid.bidderAccountId,
      amount: toMoneyDto(bid.amount),
      placedAt: isoOf(bid.placedAt),
    })),
  };
}
