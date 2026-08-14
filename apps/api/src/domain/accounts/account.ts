import type { AccountId } from '../shared/identifiers';

export type Role = 'MEMBER' | 'VAULT_STAFF' | 'OPERATIONS' | 'COMPLIANCE';

export class Account {
  private constructor(
    readonly id: AccountId,
    readonly email: string,
    readonly passwordHash: string,
    readonly roles: readonly Role[],
    readonly version: number,
  ) {}

  static create(input: { id: AccountId; email: string; passwordHash: string }): Account {
    return new Account(input.id, input.email.toLowerCase(), input.passwordHash, ['MEMBER'], 0);
  }

  static restore(input: {
    id: AccountId;
    email: string;
    passwordHash: string;
    roles: readonly Role[];
    version: number;
  }): Account {
    return new Account(input.id, input.email, input.passwordHash, input.roles, input.version);
  }

  hasRole(role: Role): boolean {
    return this.roles.includes(role);
  }

  hasAnyRole(roles: readonly Role[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }
}
