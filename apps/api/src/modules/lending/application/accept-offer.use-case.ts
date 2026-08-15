import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { Loan } from '../../../domain/lending/loan';
import { LOAN_REPOSITORY } from '../../../domain/lending/loan-repository';
import type { LoanRepository } from '../../../domain/lending/loan-repository';
import { platformAccountIds } from '../../../domain/ledger/platform-accounts';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { ListingNotFound } from '../../../domain/marketplace/listing-not-found';
import { assertWithinLoanToValue } from '../../../domain/marketplace/loan-to-value-policy';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { ReceiptNotFound } from '../../../domain/marketplace/receipt-not-found';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { CUSTODY_PORT } from '../../../domain/ports/custody.port';
import type { CustodyPort } from '../../../domain/ports/custody.port';
import { DOMAIN_EVENT_PUBLISHER } from '../../../domain/ports/domain-event-publisher.port';
import type { DomainEventPublisher } from '../../../domain/ports/domain-event-publisher.port';
import { SETTLEMENT_PORT } from '../../../domain/ports/settlement.port';
import type { SettlementPort } from '../../../domain/ports/settlement.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { DomainError } from '../../../domain/shared/domain-error';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import {
  borrowerNoteIdOf,
  lenderNoteIdOf,
  loanIdOf,
} from '../../../domain/shared/identifiers';
import type { AccountId, ListingId, OfferId } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { holdOf } from '../../marketplace/application/withdraw-offer.use-case';

export interface AcceptOfferCommand {
  readonly listingId: ListingId;
  readonly offerId: OfferId;
  readonly requestedBy: AccountId;
}

export interface OriginationOutcome {
  readonly loan: Loan;
  readonly supersededOfferIds: readonly OfferId[];
}

/* Flow 4: everything from the listing lock to the event is one transaction,
   the shape of the Phase 3 accept_offer PTB. The pause assertion of step 4
   is deferred to P7 with the pause state itself (Q-013). */
@Injectable()
export class AcceptOfferUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(LOAN_REPOSITORY) private readonly loans: LoanRepository,
    @Inject(SETTLEMENT_PORT) private readonly settlement: SettlementPort,
    @Inject(CUSTODY_PORT) private readonly custody: CustodyPort,
    @Inject(DOMAIN_EVENT_PUBLISHER) private readonly events: DomainEventPublisher,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
  ) {}

  async execute(command: AcceptOfferCommand): Promise<Result<OriginationOutcome, DomainError>> {
    try {
      return await this.unitOfWork.run(async (context) => {
        await this.listings.lock(command.listingId, context);
        const listing = await this.listings.findById(command.listingId, context);
        if (listing === null) {
          return failure(new ListingNotFound());
        }
        const receipt = await this.receipts.findById(listing.receiptId, context);
        if (receipt === null) {
          return failure(new ReceiptNotFound());
        }

        const now = this.clock.now();
        const accepted = listing.acceptOffer(
          command.offerId,
          command.requestedBy,
          this.parameters,
          now,
        );
        if (!accepted.ok) {
          return accepted;
        }
        const { winningOffer, originationFee, disbursement, supersededOfferIds } = accepted.value;

        // Checked at offer time already; checked again because the cap may
        // have tightened since (flow 4 step 3).
        const withinCap = assertWithinLoanToValue(
          winningOffer.principal,
          receipt.appraisedValue,
          receipt.itemCategory,
          this.parameters,
        );
        if (!withinCap.ok) {
          return withinCap;
        }

        const settlementRef = await this.settlement.releaseHold(
          holdOf(winningOffer, now),
          [
            { accountId: listing.borrowerAccountId, amount: disbursement },
            { accountId: platformAccountIds.feeRevenue, amount: originationFee },
          ],
          context,
        );

        const loanId = loanIdOf(this.idGenerator.generate());
        await this.custody.encumberReceipt(receipt.id, loanId, context);

        const loan = Loan.originate({
          id: loanId,
          receiptId: receipt.id,
          borrowerAccountId: listing.borrowerAccountId,
          principal: winningOffer.principal,
          annualPercentageRateBasisPoints: winningOffer.annualPercentageRateBasisPoints,
          startedAt: now,
          durationMs: winningOffer.durationMs,
          gracePeriodMs: this.parameters.gracePeriodMs,
          lenderNoteId: lenderNoteIdOf(this.idGenerator.generate()),
          borrowerNoteId: borrowerNoteIdOf(this.idGenerator.generate()),
          originationSettlementRef: settlementRef,
        });
        await this.loans.saveOrigination(
          {
            loan,
            lenderNote: {
              id: loan.lenderNoteId,
              loanId: loan.id,
              holderAccountId: winningOffer.lenderAccountId,
              transferable: this.parameters.notesTransferable,
            },
            borrowerNote: {
              id: loan.borrowerNoteId,
              loanId: loan.id,
              holderAccountId: listing.borrowerAccountId,
              transferable: this.parameters.notesTransferable,
            },
          },
          context,
        );
        await this.listings.save(accepted.value.listing, context);

        await this.events.publish(
          [
            {
              type: 'LoanOriginated',
              loanId: loan.id,
              listingId: listing.id,
              offerId: winningOffer.id,
              settlementRef,
            },
          ],
          context,
        );
        await this.audit.record(
          {
            actorType: 'ACCOUNT',
            actorId: command.requestedBy,
            subjectType: 'loan',
            subjectId: loan.id,
            action: 'accept_offer',
            after: {
              listingId: listing.id,
              offerId: winningOffer.id,
              settlementRef: settlementRef.reference,
              supersededOfferIds,
            },
          },
          context,
        );
        return ok({ loan, supersededOfferIds });
      });
    } catch (error) {
      if (error instanceof DomainError) {
        return failure(error);
      }
      throw error;
    }
  }
}
