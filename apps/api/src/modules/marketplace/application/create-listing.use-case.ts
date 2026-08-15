import { Inject, Injectable } from '@nestjs/common';
import { CUSTODY_RECEIPT_REPOSITORY } from '../../../domain/custody/custody-receipt-repository';
import type { CustodyReceiptRepository } from '../../../domain/custody/custody-receipt-repository';
import { ReceiptNotInVault } from '../../../domain/custody/receipt-not-in-vault';
import { Listing } from '../../../domain/marketplace/listing';
import { LISTING_REPOSITORY } from '../../../domain/marketplace/listing-repository';
import type { ListingRepository } from '../../../domain/marketplace/listing-repository';
import { assertWithinLoanToValue } from '../../../domain/marketplace/loan-to-value-policy';
import type { LoanToValueExceeded } from '../../../domain/marketplace/loan-to-value-exceeded';
import { NotResourceOwner } from '../../../domain/marketplace/not-resource-owner';
import { PROTOCOL_PARAMETERS } from '../../../domain/marketplace/protocol-parameters';
import type { ProtocolParameters } from '../../../domain/marketplace/protocol-parameters';
import { RateAboveMaximum } from '../../../domain/marketplace/rate-above-maximum';
import { ReceiptAlreadyListed } from '../../../domain/marketplace/receipt-already-listed';
import { AUDIT_PORT } from '../../../domain/ports/audit.port';
import type { AuditPort } from '../../../domain/ports/audit.port';
import { CLOCK_PORT } from '../../../domain/ports/clock.port';
import type { ClockPort } from '../../../domain/ports/clock.port';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { listingIdOf } from '../../../domain/shared/identifiers';
import type { AccountId, ReceiptId } from '../../../domain/shared/identifiers';
import type { Instant } from '../../../domain/shared/instant';
import type { Money } from '../../../domain/shared/money';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { ReceiptNotFound } from '../../../domain/marketplace/receipt-not-found';

export interface CreateListingCommand {
  readonly requestedBy: AccountId;
  readonly receiptId: ReceiptId;
  readonly requestedPrincipal: Money;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly requestedDurationMs: bigint;
  readonly expiresAt: Instant;
}

type CreateListingRejection =
  | ReceiptNotFound
  | NotResourceOwner
  | ReceiptNotInVault
  | ReceiptAlreadyListed
  | LoanToValueExceeded
  | RateAboveMaximum;

@Injectable()
export class CreateListingUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CUSTODY_RECEIPT_REPOSITORY) private readonly receipts: CustodyReceiptRepository,
    @Inject(LISTING_REPOSITORY) private readonly listings: ListingRepository,
    @Inject(PROTOCOL_PARAMETERS) private readonly parameters: ProtocolParameters,
    @Inject(AUDIT_PORT) private readonly audit: AuditPort,
    @Inject(CLOCK_PORT) private readonly clock: ClockPort,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: CreateListingCommand): Promise<Result<Listing, CreateListingRejection>> {
    return this.unitOfWork.run(async (context) => {
      const receipt = await this.receipts.findById(command.receiptId, context);
      if (receipt === null) {
        return failure(new ReceiptNotFound());
      }
      if (receipt.holderAccountId !== command.requestedBy) {
        return failure(new NotResourceOwner());
      }
      if (receipt.status !== 'IN_VAULT') {
        return failure(new ReceiptNotInVault());
      }
      const live = await this.listings.findLiveByReceipt(command.receiptId, context);
      if (live !== null) {
        return failure(new ReceiptAlreadyListed());
      }
      if (
        command.maxAnnualPercentageRateBasisPoints >
        this.parameters.maxAnnualPercentageRateBasisPoints
      ) {
        return failure(new RateAboveMaximum());
      }
      // Better to fail here than to let the borrower publish something no
      // lender can legally fund (docs/10-flows.md flow 2).
      const withinLoanToValue = assertWithinLoanToValue(
        command.requestedPrincipal,
        receipt.appraisedValue,
        receipt.itemCategory,
        this.parameters,
      );
      if (!withinLoanToValue.ok) {
        return withinLoanToValue;
      }

      const listing = Listing.draft({
        id: listingIdOf(this.idGenerator.generate()),
        borrowerAccountId: command.requestedBy,
        receiptId: command.receiptId,
        requestedPrincipal: command.requestedPrincipal,
        maxAnnualPercentageRateBasisPoints: command.maxAnnualPercentageRateBasisPoints,
        requestedDurationMs: command.requestedDurationMs,
        expiresAt: command.expiresAt,
      });
      await this.listings.save(listing, context);
      await this.audit.record(
        {
          actorType: 'ACCOUNT',
          actorId: command.requestedBy,
          subjectType: 'listing',
          subjectId: listing.id,
          action: 'create_listing',
          after: { receiptId: command.receiptId },
        },
        context,
      );
      return ok(listing);
    });
  }
}
