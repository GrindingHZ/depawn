import { Inject, Injectable } from '@nestjs/common';
import { LOAN_QUERIES } from '../../../domain/ports/loan-queries.port';
import type { LoanQueries } from '../../../domain/ports/loan-queries.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import type { AccountId, LoanId } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import type { Money } from '../../../domain/shared/money';

/* Long enough that a borrower can read the figure and press the button,
   short enough that the amount charged is the amount shown. Not a protocol
   parameter until someone asks for it (Q-015). */
export const payoffQuoteValidityMs = 5n * 60n * 1000n;

export interface PayoffQuote {
  readonly loanId: LoanId;
  readonly principal: Money;
  readonly accruedInterest: Money;
  readonly total: Money;
  readonly quotedAt: Instant;
  readonly validUntil: Instant;
}

@Injectable()
export class PayoffQuoteQuery {
  constructor(
    @Inject(LOAN_QUERIES) private readonly loans: LoanQueries,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
  ) {}

  /* Returns null for a loan the caller is not party to as well as for one
     that does not exist, so the endpoint leaks no existence. */
  async read(loanId: LoanId, requestedBy: AccountId): Promise<PayoffQuote | null> {
    const readModel = await this.loans.findById(loanId);
    if (readModel === null) {
      return null;
    }
    const { loan } = readModel;
    if (
      loan.borrowerAccountId !== requestedBy &&
      readModel.lenderNoteHolderAccountId !== requestedBy
    ) {
      return null;
    }

    const quotedAt = this.clock.now();
    const accruedInterest = loan.calculateAccruedInterest(quotedAt);
    return {
      loanId: loan.id,
      principal: loan.principal,
      accruedInterest,
      total: loan.principal.plus(accruedInterest),
      quotedAt,
      validUntil: quotedAt.plusMilliseconds(payoffQuoteValidityMs),
    };
  }
}
