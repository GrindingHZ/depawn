/* The state machines are correct and their names are correct. `IN_VAULT` and
   `SUPERSEDED` are exactly the right words for a domain model and exactly the
   wrong ones to shout at a customer, so this is the one place that turns a
   state into something a person reads. The enum on the wire never changes.

   Written from the reader's side: a listing is not `MATCHED`, it is funded;
   an offer is not `SUPERSEDED`, it was outbid. */
const receiptStatuses: Record<string, string> = {
  IN_VAULT: 'In the vault',
  ENCUMBERED: 'Securing a loan',
  RELEASED: 'Collected',
  LIQUIDATED: 'Sold',
};

const listingStatuses: Record<string, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Taking offers',
  MATCHED: 'Funded',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
};

const offerStatuses: Record<string, string> = {
  PENDING: 'Standing',
  ACCEPTED: 'Accepted',
  WITHDRAWN: 'Withdrawn',
  EXPIRED: 'Expired',
  SUPERSEDED: 'Outbid',
};

const loanStatuses: Record<string, string> = {
  ACTIVE: 'Running',
  REPAID: 'Repaid',
  DEFAULTED: 'Defaulted',
  LIQUIDATED: 'Sold',
};

const redemptionStatuses: Record<string, string> = {
  REQUESTED: 'Requested',
  VERIFIED: 'Identity verified',
  RELEASED: 'Handed over',
};

const liquidationStatuses: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  BIDDING: 'Taking bids',
  SETTLED: 'Settled',
  CANCELLED: 'Cancelled',
};

/* Falls back to the code itself. An unnamed state is better shown raw than
   hidden: staff can still read it and report it. */
function nameFrom(table: Record<string, string>, status: string): string {
  return table[status] ?? status;
}

export const nameForReceiptStatus = (status: string): string => nameFrom(receiptStatuses, status);
export const nameForListingStatus = (status: string): string => nameFrom(listingStatuses, status);
export const nameForOfferStatus = (status: string): string => nameFrom(offerStatuses, status);
export const nameForLoanStatus = (status: string): string => nameFrom(loanStatuses, status);
export const nameForRedemptionStatus = (status: string): string =>
  nameFrom(redemptionStatuses, status);
export const nameForLiquidationStatus = (status: string): string =>
  nameFrom(liquidationStatuses, status);
