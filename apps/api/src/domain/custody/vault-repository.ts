import type { VaultId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Vault } from './vault';

export interface VaultRepository {
  findById(id: VaultId, context: UnitOfWorkContext): Promise<Vault | null>;
  save(vault: Vault, context: UnitOfWorkContext): Promise<void>;
  /* Serialises exposure checks per vault; issuing two receipts concurrently
     must not slip past the insured limit. */
  lock(id: VaultId, context: UnitOfWorkContext): Promise<void>;
}

export const VAULT_REPOSITORY = Symbol('VaultRepository');
