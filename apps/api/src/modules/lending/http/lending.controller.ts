import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { loanRoleSchema } from '@depawn/contracts';
import type { LoanResponse, MyLoansResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { LOAN_QUERIES } from '../../../domain/ports/loan-queries.port';
import type { LoanQueries } from '../../../domain/ports/loan-queries.port';
import { listingIdOf, loanIdOf, offerIdOf } from '../../../domain/shared/identifiers';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { IdempotencyInterceptor } from '../../shared/http/idempotency.interceptor';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { marketplaceStatusFor } from '../../marketplace/http/marketplace-response.mapper';
import { AcceptOfferUseCase } from '../application/accept-offer.use-case';
import { toLoanResponse } from './lending-response.mapper';

@Controller()
export class LendingController {
  constructor(
    private readonly acceptOffer: AcceptOfferUseCase,
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
      throw new DomainErrorHttpException(result.error, marketplaceStatusFor(result.error.code));
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
}
