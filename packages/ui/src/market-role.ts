import type { CollateralRelationship } from './collateral-row';
import type { MarketRole } from './market-delta';

export interface ViewerStanding {
  readonly borrowerAccountId: string;
  readonly viewerAccountId: string | null;
  /* A pending offer by the viewer on this listing. */
  readonly hasLiveOffer: boolean;
  /* The viewer holds the lender note on the loan this listing became. */
  readonly hasFundedLoan: boolean;
}

export interface ViewerPosition {
  readonly role: MarketRole;
  readonly relationship: CollateralRelationship;
}

/* Which side of a listing somebody is on, derived rather than chosen.

   A toggle would ask the reader to restate something the server already
   knows, and a toggle left in the wrong position tells them the opposite of
   the truth about their own money while looking perfectly normal.

   Ordering matters: owning the listing outranks having offered on it, because
   a borrower who has also lent elsewhere is still the borrower here. */
export function positionOf(standing: ViewerStanding): ViewerPosition {
  if (standing.viewerAccountId === null) {
    return { role: 'lender', relationship: 'none' };
  }
  if (standing.borrowerAccountId === standing.viewerAccountId) {
    return { role: 'borrower', relationship: 'borrower' };
  }
  if (standing.hasFundedLoan) {
    return { role: 'lender', relationship: 'funded' };
  }
  if (standing.hasLiveOffer) {
    return { role: 'lender', relationship: 'offered' };
  }
  /* Somebody browsing a listing they have no stake in is reading it as a
     lender would, because lending is the only thing they could do next. */
  return { role: 'lender', relationship: 'none' };
}
