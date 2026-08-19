import { marketIndexResponseSchema, marketTapeResponseSchema } from '../market';
import type { MarketIndexResponse, MarketTapeResponse } from '../market';
import { requestJson } from './http';

const basePath = '/api/v1';

export interface MarketIndexOptions {
  /* How far back the comparison reaches. The server decides the default so
     every client on the strip is comparing against the same thing. */
  readonly windowMs?: number;
}

export function fetchMarketIndex(options: MarketIndexOptions = {}): Promise<MarketIndexResponse> {
  const query = new URLSearchParams();
  if (options.windowMs !== undefined) {
    query.set('windowMs', String(options.windowMs));
  }
  const suffix = query.size === 0 ? '' : `?${query.toString()}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/market/index${suffix}`,
    responseSchema: marketIndexResponseSchema,
  });
}

export function fetchMarketTape(limit?: number): Promise<MarketTapeResponse> {
  const suffix = limit === undefined ? '' : `?limit=${String(limit)}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/market/tape${suffix}`,
    responseSchema: marketTapeResponseSchema,
  });
}
