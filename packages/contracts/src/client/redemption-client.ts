import {
  redemptionRequestListResponseSchema,
  redemptionRequestResponseSchema,
} from '../redemption';
import type {
  ConfirmReleaseRequest,
  RedemptionRequestListResponse,
  RedemptionRequestResponse,
  RedemptionStatusDto,
} from '../redemption';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function requestRedemption(
  receiptId: string,
  options: RequestOptions,
): Promise<RedemptionRequestResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/receipts/${receiptId}/redemption-requests`,
    body: {},
    options,
    responseSchema: redemptionRequestResponseSchema,
  });
}

export function fetchMyRedemptionRequests(): Promise<RedemptionRequestListResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/redemption-requests`,
    responseSchema: redemptionRequestListResponseSchema,
  });
}

export function fetchRedemptionQueue(
  vaultId: string,
  status?: RedemptionStatusDto,
): Promise<RedemptionRequestListResponse> {
  const query = status === undefined ? '' : `&status=${status}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/redemption-requests?vaultId=${vaultId}${query}`,
    responseSchema: redemptionRequestListResponseSchema,
  });
}

export function verifyRedemption(
  requestId: string,
  options: RequestOptions,
): Promise<RedemptionRequestResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/redemption-requests/${requestId}/verify`,
    body: {},
    options,
    responseSchema: redemptionRequestResponseSchema,
  });
}

export function confirmRelease(
  requestId: string,
  body: ConfirmReleaseRequest,
  options: RequestOptions,
): Promise<RedemptionRequestResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/redemption-requests/${requestId}/release`,
    body,
    options,
    responseSchema: redemptionRequestResponseSchema,
  });
}
