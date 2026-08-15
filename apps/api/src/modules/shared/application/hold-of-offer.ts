import type { Offer } from '../../../domain/marketplace/offer';
import type { FundsHold } from '../../../domain/ports/settlement.port';
import type { Instant } from '../../../domain/shared/instant';

/* The settlement adapter resolves a hold by id and reads its state from the
   funds hold row, so the reconstructed object only carries identity. Both
   withdrawal and origination settle an offer's hold, so the reconstruction
   lives outside either use case. */
export function holdOfOffer(offer: Offer, settledAt: Instant): FundsHold {
  return {
    id: offer.fundsHoldId,
    accountId: offer.lenderAccountId,
    amount: offer.principal,
    settlementRef: { kind: 'ledger', reference: offer.fundsHoldId, settledAt },
  };
}
