import { describe, expect, it } from 'vitest';
import { Session } from './session';
import { accountIdOf, sessionIdOf } from '../shared/identifiers';
import { Instant } from '../shared/instant';

describe('Session', () => {
  const expiresAt = Instant.fromEpochMilliseconds(1_700_000_000_000n);
  const session = Session.create({
    id: sessionIdOf('01S'),
    accountId: accountIdOf('01A'),
    tokenHash: 'hash',
    expiresAt,
  });

  it('is live until its expiry instant', () => {
    expect(session.isExpired(expiresAt.plusMilliseconds(-1n))).toBe(false);
    expect(session.isExpired(expiresAt)).toBe(false);
  });

  it('expires after its expiry instant', () => {
    expect(session.isExpired(expiresAt.plusMilliseconds(1n))).toBe(true);
  });
});
