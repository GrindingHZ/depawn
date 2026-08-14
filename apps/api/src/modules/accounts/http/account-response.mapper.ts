import type { AccountResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';

export function toAccountResponse(account: Account): AccountResponse {
  return {
    id: account.id,
    email: account.email,
    roles: [...account.roles],
  };
}
