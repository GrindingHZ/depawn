import type { AccountId } from './identifiers';
import type { Instant } from './instant';
import type { Money } from './money';

/* In Phase 1 the reference is a ledger transaction id; in Phase 3 it is a Sui
   transaction digest. Every entity that resulted from a value movement stores
   one, so the API shape survives the pivot unchanged. */
export interface SettlementRef {
  readonly kind: 'ledger' | 'chain';
  readonly reference: string;
  readonly settledAt: Instant;
}

export interface Distribution {
  readonly accountId: AccountId;
  readonly amount: Money;
}
