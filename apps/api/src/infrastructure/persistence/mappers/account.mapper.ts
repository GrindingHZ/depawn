import type { Account as AccountRow, Role as PrismaRole } from '@prisma/client';
import { Account } from '../../../domain/accounts/account';
import type { Role } from '../../../domain/accounts/account';
import { accountIdOf } from '../../../domain/shared/identifiers';

/* The Prisma enum and the domain union are kept independent on purpose
   (docs/09-conventions.md); these tables are the only translation point. */
const domainRoleByPrismaRole: Record<PrismaRole, Role> = {
  MEMBER: 'MEMBER',
  VAULT_STAFF: 'VAULT_STAFF',
  OPERATIONS: 'OPERATIONS',
  COMPLIANCE: 'COMPLIANCE',
};

const prismaRoleByDomainRole: Record<Role, PrismaRole> = {
  MEMBER: 'MEMBER',
  VAULT_STAFF: 'VAULT_STAFF',
  OPERATIONS: 'OPERATIONS',
  COMPLIANCE: 'COMPLIANCE',
};

export function toAccount(row: AccountRow): Account {
  return Account.restore({
    id: accountIdOf(row.id),
    email: row.email,
    passwordHash: row.passwordHash,
    roles: row.roles.map((role) => domainRoleByPrismaRole[role]),
    version: row.version,
  });
}

export function toAccountRow(account: Account): {
  id: string;
  email: string;
  passwordHash: string;
  roles: PrismaRole[];
  version: number;
} {
  return {
    id: account.id,
    email: account.email,
    passwordHash: account.passwordHash,
    roles: account.roles.map((role) => prismaRoleByDomainRole[role]),
    version: account.version,
  };
}
