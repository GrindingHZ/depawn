import {
  balanceResponseSchema,
  ledgerEntriesResponseSchema,
  settlementResponseSchema,
} from '../wallet';
import type {
  BalanceResponse,
  DepositRequest,
  LedgerEntriesResponse,
  SettlementResponse,
  WithdrawalRequest,
} from '../wallet';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function fetchBalance(): Promise<BalanceResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/balance`,
    responseSchema: balanceResponseSchema,
  });
}

export function fetchLedgerEntries(
  cursor?: string,
  limit?: number,
): Promise<LedgerEntriesResponse> {
  const parameters = new URLSearchParams();
  if (cursor !== undefined) {
    parameters.set('cursor', cursor);
  }
  if (limit !== undefined) {
    parameters.set('limit', String(limit));
  }
  const query = parameters.size > 0 ? `?${parameters.toString()}` : '';
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/ledger-entries${query}`,
    responseSchema: ledgerEntriesResponseSchema,
  });
}

export function deposit(
  body: DepositRequest,
  options: RequestOptions,
): Promise<SettlementResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/me/deposits`,
    body,
    options,
    responseSchema: settlementResponseSchema,
  });
}

export function withdraw(
  body: WithdrawalRequest,
  options: RequestOptions,
): Promise<SettlementResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/me/withdrawals`,
    body,
    options,
    responseSchema: settlementResponseSchema,
  });
}
