import type { AccountId, LedgerAccountId } from '../shared/identifiers';
import type { Currency } from '../shared/money';

export type LedgerAccountOwnerType = 'USER' | 'PLATFORM' | 'HOLD';

export type LedgerAccountPurpose =
  'USER_AVAILABLE' | 'USER_HELD' | 'PLATFORM_FEE_REVENUE' | 'PLATFORM_ROUNDING' | 'PLATFORM_FLOAT';

export interface LedgerAccount {
  readonly id: LedgerAccountId;
  readonly ownerType: LedgerAccountOwnerType;
  readonly ownerId: AccountId | null;
  readonly purpose: LedgerAccountPurpose;
  readonly currency: Currency;
}
