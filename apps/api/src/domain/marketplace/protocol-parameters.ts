import type { ItemCategory } from '../custody/item-category';
import type { Money } from '../shared/money';

/* The tunable rules of the protocol, one object so Phase 3 can mirror it as
   a shared Config object mutated through an AdminCap. Values here are the
   demo defaults from docs/OPEN-QUESTIONS.md Q-001, Q-003, Q-005, and Q-007;
   admin editing arrives with P7. */
export interface ProtocolParameters {
  readonly maxLoanToValueBasisPointsByCategory: Readonly<Record<ItemCategory, number>>;
  readonly maxAnnualPercentageRateBasisPoints: number;
  readonly minimumOfferLifetimeMs: bigint;
  readonly originationFeeBasisPoints: number;
  readonly liquidationFeeBasisPoints: number;
  readonly gracePeriodMs: bigint;
  readonly statutoryHoldingPeriodMs: bigint;
  readonly dualAppraisalThreshold: Money;
  readonly notesTransferable: boolean;
}

export const PROTOCOL_PARAMETERS = Symbol('ProtocolParameters');
