import type { Account } from '../accounts/account';
import type { AccountId } from '../shared/identifiers';

/* Phase 1 subjects come from a session; Phase 3 adds a wallet variant with a
   signed challenge, and the redemption flow calls verifyControl in both. */
export type AuthenticatedSubject = { readonly kind: 'session'; readonly accountId: AccountId };

export type ControlProof =
  | { readonly kind: 'session'; readonly accountId: AccountId }
  | { readonly kind: 'signed-challenge'; readonly challenge: string; readonly signature: string };

export interface IdentityPort {
  resolveAccount(subject: AuthenticatedSubject): Promise<Account>;
  verifyControl(accountId: AccountId, proof: ControlProof): Promise<boolean>;
}

export const IDENTITY_PORT = Symbol('IdentityPort');
