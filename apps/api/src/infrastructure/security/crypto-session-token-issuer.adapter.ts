import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  SessionTokenIssuer,
  SessionTokenPair,
} from '../../domain/accounts/session-token-issuer';

@Injectable()
export class CryptoSessionTokenIssuerAdapter implements SessionTokenIssuer {
  issue(): SessionTokenPair {
    const token = randomBytes(32).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
