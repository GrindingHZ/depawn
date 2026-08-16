import { liquidationListResponseSchema, liquidationResponseSchema } from '../liquidation';
import type {
  LiquidationListResponse,
  LiquidationResponse,
  LiquidationStatusDto,
  OpenLiquidationRequest,
  PlaceBidRequest,
  ScheduleLiquidationRequest,
} from '../liquidation';
import { settlementResponseSchema } from '../wallet';
import type { SettlementResponse } from '../wallet';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function scheduleLiquidation(
  loanId: string,
  body: ScheduleLiquidationRequest,
  options: RequestOptions,
): Promise<LiquidationResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/loans/${loanId}/liquidations`,
    body,
    options,
    responseSchema: liquidationResponseSchema,
  });
}

export function openLiquidation(
  liquidationId: string,
  body: OpenLiquidationRequest,
  options: RequestOptions,
): Promise<LiquidationResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/liquidations/${liquidationId}/open`,
    body,
    options,
    responseSchema: liquidationResponseSchema,
  });
}

export function fetchLiquidations(status?: LiquidationStatusDto): Promise<LiquidationListResponse> {
  const query = status === undefined ? '' : `?status=${status}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/liquidations${query}`,
    responseSchema: liquidationListResponseSchema,
  });
}

export function fetchLiquidation(liquidationId: string): Promise<LiquidationResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/liquidations/${liquidationId}`,
    responseSchema: liquidationResponseSchema,
  });
}

export function placeBid(
  liquidationId: string,
  body: PlaceBidRequest,
  options: RequestOptions,
): Promise<LiquidationResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/liquidations/${liquidationId}/bids`,
    body,
    options,
    responseSchema: liquidationResponseSchema,
  });
}

export function closeLiquidation(
  liquidationId: string,
  options: RequestOptions,
): Promise<LiquidationResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/liquidations/${liquidationId}/close`,
    body: {},
    options,
    responseSchema: liquidationResponseSchema,
  });
}

export function reclaimBid(
  liquidationId: string,
  bidId: string,
  options: RequestOptions,
): Promise<SettlementResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/liquidations/${liquidationId}/bids/${bidId}/reclaim`,
    body: {},
    options,
    responseSchema: settlementResponseSchema,
  });
}
