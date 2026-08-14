export interface SessionTokenPair {
  readonly token: string;
  readonly tokenHash: string;
}

export interface SessionTokenIssuer {
  issue(): SessionTokenPair;
  hash(token: string): string;
}

export const SESSION_TOKEN_ISSUER = Symbol('SessionTokenIssuer');
