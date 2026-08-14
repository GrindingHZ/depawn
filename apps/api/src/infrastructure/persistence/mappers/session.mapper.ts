import type { Session as SessionRow } from '@prisma/client';
import { Session } from '../../../domain/accounts/session';
import { accountIdOf, sessionIdOf } from '../../../domain/shared/identifiers';
import { Instant } from '../../../domain/shared/instant';

export function toSession(row: SessionRow): Session {
  return Session.restore({
    id: sessionIdOf(row.id),
    accountId: accountIdOf(row.accountId),
    tokenHash: row.tokenHash,
    expiresAt: Instant.fromEpochMilliseconds(BigInt(row.expiresAt.getTime())),
  });
}

export function toSessionRow(session: Session): {
  id: string;
  accountId: string;
  tokenHash: string;
  expiresAt: Date;
} {
  return {
    id: session.id,
    accountId: session.accountId,
    tokenHash: session.tokenHash,
    expiresAt: new Date(Number(session.expiresAt.epochMilliseconds)),
  };
}
