import { accountIdOf } from '../shared/identifiers';
import type { AccountId } from '../shared/identifiers';
import type { LedgerAccountPurpose } from './ledger-account';

/* Platform actors appear in a Distribution as ordinary account ids, mirroring
   Phase 3 where a distribution target is just an address. These sentinels map
   to the platform ledger accounts in the chart of accounts. */
export const platformAccountIds = {
  feeRevenue: accountIdOf('PLATFORM_FEE_REVENUE'),
  rounding: accountIdOf('PLATFORM_ROUNDING'),
  float: accountIdOf('PLATFORM_FLOAT'),
} as const;

const purposeBySentinel = new Map<AccountId, LedgerAccountPurpose>([
  [platformAccountIds.feeRevenue, 'PLATFORM_FEE_REVENUE'],
  [platformAccountIds.rounding, 'PLATFORM_ROUNDING'],
  [platformAccountIds.float, 'PLATFORM_FLOAT'],
]);

export function platformPurposeOf(accountId: AccountId): LedgerAccountPurpose | null {
  return purposeBySentinel.get(accountId) ?? null;
}
