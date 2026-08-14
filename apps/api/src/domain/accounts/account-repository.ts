import type { AccountId } from '../shared/identifiers';
import type { UnitOfWorkContext } from '../ports/unit-of-work';
import type { Account } from './account';

export interface AccountRepository {
  findById(id: AccountId, context: UnitOfWorkContext): Promise<Account | null>;
  findByEmail(email: string, context: UnitOfWorkContext): Promise<Account | null>;
  save(account: Account, context: UnitOfWorkContext): Promise<void>;
}

export const ACCOUNT_REPOSITORY = Symbol('AccountRepository');
