import type { AccountId } from '../shared/identifiers';

export type Role = 'MEMBER' | 'VAULT_STAFF' | 'OPERATIONS' | 'COMPLIANCE';

/* Declared as a readonly shape in P0 so the identity port can be typed; the
   persistence and auth behaviour land in the p0d-auth slice. */
export interface Account {
  readonly id: AccountId;
  readonly roles: readonly Role[];
}
