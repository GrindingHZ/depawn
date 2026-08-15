import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { loanRoleSchema, repayLoanRequestSchema } from '@depawn/contracts';
import type {
  LoanResponse,
  MyLoansResponse,
  PayoffQuoteResponse,
  RepayLoanRequest,
  RepaymentResponse,
} from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { LOAN_QUERIES } from '../../../domain/ports/loan-queries.port';
import type { LoanQueries } from '../../../domain/ports/loan-queries.port';
import { listingIdOf, loanIdOf, offerIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toMoneyDto } from '../../shared/http/money.mapper';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { domainErrorStatusFor } from '../../shared/http/domain-error-status';
import { AcceptOfferUseCase } from '../application/accept-offer.use-case';
import { PayoffQuoteQuery } from '../application/payoff-quote.query';
import { RepayLoanUseCase } from '../application/repay-loan.use-case';
import { Instant } from '../../../domain/shared/instant';
import { PayoffQuoteStale } from '../../../domain/lending/payoff-quote-stale';
import { RepaymentAmountInsufficient } from '../../../domain/lending/repayment-amount-insufficient';
import { toLoanResponse, toPayoffQuoteResponse } from './lending-response.mapper';

@Controller()
export class LendingController {
  constructor(
    private readonly acceptOffer: AcceptOfferUseCase,
    private readonly payoffQuote: PayoffQuoteQuery,
    private readonly repayLoan: RepayLoanUseCase,
    @Inject(LOAN_QUERIES) private readonly loanQueries: LoanQueries,
  ) {}

  @Post('listings/:listingId/offers/:offerId/accept')
  @UseInterceptors(IdempotencyInterceptor)
  async accept(
    @Param('listingId') listingId: string,
    @Param('offerId') offerId: string,
    @CurrentAccount() account: Account,
  ): Promise<LoanResponse> {
    const result = await this.acceptOffer.execute({
      listingId: listingIdOf(listingId),
      offerId: offerIdOf(offerId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    const readModel = await this.loanQueries.findById(result.value.loan.id);
    if (readModel === null) {
      throw new Error(`Loan ${result.value.loan.id} vanished after origination`);
    }
    return toLoanResponse(readModel);
  }

  @Get('me/loans')
  async myLoans(
    @CurrentAccount() account: Account,
    @Query('role', new ZodValidationPipe(loanRoleSchema)) role: 'borrower' | 'lender',
  ): Promise<MyLoansResponse> {
    const loans = await this.loanQueries.listByParticipant(account.id, role);
    return { items: loans.map(toLoanResponse) };
  }

  /* Loans are private to their parties; anyone else sees the same 404 as a
     missing id so existence does not leak. */
  @Get('loans/:loanId')
  async read(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
  ): Promise<LoanResponse> {
    const readModel = await this.loanQueries.findById(loanIdOf(loanId));
    if (
      readModel === null ||
      (readModel.loan.borrowerAccountId !== account.id &&
        readModel.lenderNoteHolderAccountId !== account.id)
    ) {
      throw new NotFoundException();
    }
    return toLoanResponse(readModel);
  }

  @Get('loans/:loanId/payoff-quote')
  async quote(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
  ): Promise<PayoffQuoteResponse> {
    const quote = await this.payoffQuote.read(loanIdOf(loanId), account.id);
    if (quote === null) {
      throw new NotFoundException();
    }
    return toPayoffQuoteResponse(quote);
  }

  @Post('loans/:loanId/repay')
  @UseInterceptors(IdempotencyInterceptor)
  async repay(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
    @Body(new ZodValidationPipe(repayLoanRequestSchema)) body: RepayLoanRequest,
  ): Promise<RepaymentResponse> {
    const result = await this.repayLoan.execute({
      loanId: loanIdOf(loanId),
      requestedBy: account.id,
      payment: toMoney(body.amount),
      quotedAt: Instant.fromEpochMilliseconds(BigInt(new Date(body.quotedAt).getTime())),
    });
    if (!result.ok) {
      // A stale quote and a short payment both carry the figure now owed so
      // the borrower sees what changed (docs/10-flows.md flow 5).
      const details =
        result.error instanceof PayoffQuoteStale ||
        result.error instanceof RepaymentAmountInsufficient
          ? { amountDue: toMoneyDto(result.error.amountDue) }
          : undefined;
      throw new DomainErrorHttpException(
        result.error,
        domainErrorStatusFor(result.error.code),
        details,
      );
    }

    const readModel = await this.loanQueries.findById(result.value.breakdown.loan.id);
    if (readModel === null) {
      throw new Error(`Loan ${result.value.breakdown.loan.id} vanished after repayment`);
    }
    return {
      loan: toLoanResponse(readModel),
      principal: toMoneyDto(result.value.breakdown.principal),
      accruedInterest: toMoneyDto(result.value.breakdown.accruedInterest),
      total: toMoneyDto(result.value.breakdown.total),
      paidToAccountId: result.value.paidTo,
    };
  }
}
