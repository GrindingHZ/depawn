import type {
  AccountId,
  LiquidationId,
  ListingId,
  LoanId,
  OfferId,
  ReceiptId,
  StaffId,
  VaultId,
} from './identifiers';
import type { Instant } from './instant';
import type { Money } from './money';
import type { Distribution, SettlementRef } from './settlement-ref';

/* Every event name matches the Move struct emitted in Phase 3, character for
   character, so the indexer maps chain events onto the same handlers. */
export type DomainEvent =
  | { type: 'ReceiptIssued'; receiptId: ReceiptId; vaultId: VaultId; appraisedValue: Money }
  | { type: 'ListingPublished'; listingId: ListingId; borrowerAccountId: AccountId }
  | {
      type: 'OfferPlaced';
      listingId: ListingId;
      offerId: OfferId;
      principal: Money;
      rateBasisPoints: number;
    }
  | { type: 'OfferWithdrawn'; offerId: OfferId }
  | {
      type: 'LoanOriginated';
      loanId: LoanId;
      listingId: ListingId;
      offerId: OfferId;
      settlementRef: SettlementRef;
    }
  | { type: 'LoanRepaid'; loanId: LoanId; amountPaid: Money; settlementRef: SettlementRef }
  | { type: 'LoanDefaulted'; loanId: LoanId; defaultedAt: Instant }
  | {
      type: 'ReceiptClaimedByLender';
      loanId: LoanId;
      receiptId: ReceiptId;
      claimantAccountId: AccountId;
    }
  | { type: 'RedemptionRequested'; receiptId: ReceiptId; requestedBy: AccountId }
  | { type: 'ItemReleased'; receiptId: ReceiptId; releasedBy: StaffId }
  | {
      type: 'LiquidationSettled';
      liquidationId: LiquidationId;
      proceeds: Money;
      distributions: Distribution[];
    };
