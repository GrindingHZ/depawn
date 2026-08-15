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
import type { LoanId } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { toMoney, toMoneyDto } from '../../shared/http/money.mapper';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { domainErrorStatusFor } from '../../shared/http/domain-error-status';
import { AcceptOfferUseCase } from '../application/accept-offer.use-case';
import { ClaimReceiptUseCase } from '../application/claim-receipt.use-case';
import { MarkDefaultUseCase } from '../application/mark-default.use-case';
import { PayoffQuoteQuery } from '../application/payoff-quote.query';
import { RepayLoanUseCase } from '../application/repay-loan.use-case';
import { Instant } from '../../../domain/shared/instant';
import { GracePeriodActive } from '../../../domain/lending/grace-period-active';
import { PayoffQuoteStale } from '../../../domain/lending/payoff-quote-stale';
import { RepaymentAmountInsufficient } from '../../../domain/lending/repayment-amount-insufficient';
import { isoOf, toLoanResponse, toPayoffQuoteResponse } from './lending-response.mapper';

@Controller()
export class LendingController {
  constructor(
    private readonly acceptOffer: AcceptOfferUseCase,
    private readonly payoffQuote: PayoffQuoteQuery,
    private readonly repayLoan: RepayLoanUseCase,
    private readonly markDefault: MarkDefaultUseCase,
    private readonly claimReceipt: ClaimReceiptUseCase,
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
    return this.loanResponseFor(result.value.loan.id);
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

  @Post('loans/:loanId/default')
  @UseInterceptors(IdempotencyInterceptor)
  async markLoanDefaulted(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
  ): Promise<LoanResponse> {
    const result = await this.markDefault.execute({
      loanId: loanIdOf(loanId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      // The deadline travels with the rejection so a lender told it is too
      // early is also told until when.
      const details =
        result.error instanceof GracePeriodActive
          ? { graceEndsAt: isoOf(result.error.graceEndsAt) }
          : undefined;
      throw new DomainErrorHttpException(
        result.error,
        domainErrorStatusFor(result.error.code),
        details,
      );
    }
    return this.loanResponseFor(result.value.id);
  }

  @Post('loans/:loanId/claim-receipt')
  @UseInterceptors(IdempotencyInterceptor)
  async claim(
    @Param('loanId') loanId: string,
    @CurrentAccount() account: Account,
  ): Promise<LoanResponse> {
    const result = await this.claimReceipt.execute({
      loanId: loanIdOf(loanId),
      requestedBy: account.id,
    });
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, domainErrorStatusFor(result.error.code));
    }
    return this.loanResponseFor(result.value.id);
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

    return {
      loan: await this.loanResponseFor(result.value.breakdown.loan.id),
      principal: toMoneyDto(result.value.breakdown.principal),
      accruedInterest: toMoneyDto(result.value.breakdown.accruedInterest),
      total: toMoneyDto(result.value.breakdown.total),
      paidToAccountId: result.value.paidTo,
    };
  }

  /* Every write returns the loan as it now stands, read back through the
     same query the read endpoints use so the two can never disagree. */
  private async loanResponseFor(loanId: LoanId): Promise<LoanResponse> {
    const readModel = await this.loanQueries.findById(loanId);
    if (readModel === null) {
      throw new Error(`Loan ${loanId} vanished after being written`);
    }
    return toLoanResponse(readModel);
  }
}
