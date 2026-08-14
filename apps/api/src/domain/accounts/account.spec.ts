import { describe, expect, it } from 'vitest';
import { Account } from './account';
import { accountIdOf } from '../shared/identifiers';

describe('Account', () => {
  it('creates a member account with a lowercased email', () => {
    const account = Account.create({
      id: accountIdOf('01A'),
      email: 'Borrower@Example.Test',
      passwordHash: 'hash',
    });
    expect(account.email).toBe('borrower@example.test');
    expect(account.roles).toEqual(['MEMBER']);
    expect(account.version).toBe(0);
  });

  it('answers role membership', () => {
    const account = Account.restore({
      id: accountIdOf('01A'),
      email: 'ops@example.test',
      passwordHash: 'hash',
      roles: ['OPERATIONS'],
      version: 3,
    });
    expect(account.hasRole('OPERATIONS')).toBe(true);
    expect(account.hasRole('MEMBER')).toBe(false);
    expect(account.hasAnyRole(['MEMBER', 'OPERATIONS'])).toBe(true);
    expect(account.hasAnyRole(['MEMBER', 'COMPLIANCE'])).toBe(false);
  });
});
