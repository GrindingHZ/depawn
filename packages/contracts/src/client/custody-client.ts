import {
  evidenceItemSchema,
  intakeResponseSchema,
  receiptListResponseSchema,
  receiptResponseSchema,
  vaultExposureResponseSchema,
} from '../custody';
import type {
  BeginIntakeRequest,
  EvidenceItemDto,
  IntakeResponse,
  IssueReceiptRequest,
  PatchIntakeRequest,
  ReceiptListResponse,
  ReceiptResponse,
  RecordAppraisalRequest,
  VaultExposureResponse,
} from '../custody';
import { requestJson, requestMultipart } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function beginIntake(
  vaultId: string,
  body: BeginIntakeRequest,
  options: RequestOptions,
): Promise<IntakeResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/vaults/${vaultId}/intakes`,
    body,
    options,
    responseSchema: intakeResponseSchema,
  });
}

export function fetchIntake(intakeId: string): Promise<IntakeResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/intakes/${intakeId}`,
    responseSchema: intakeResponseSchema,
  });
}

export function patchIntake(
  intakeId: string,
  body: PatchIntakeRequest,
  options: RequestOptions,
): Promise<IntakeResponse> {
  return requestJson({
    method: 'PATCH',
    path: `${basePath}/intakes/${intakeId}`,
    body,
    options,
    responseSchema: intakeResponseSchema,
  });
}

export function uploadIntakePhoto(
  intakeId: string,
  file: File,
  options: RequestOptions,
): Promise<EvidenceItemDto> {
  const formData = new FormData();
  formData.append('photo', file);
  return requestMultipart({
    path: `${basePath}/intakes/${intakeId}/photos`,
    formData,
    options,
    responseSchema: evidenceItemSchema,
  });
}

export function recordAppraisal(
  intakeId: string,
  body: RecordAppraisalRequest,
  options: RequestOptions,
): Promise<IntakeResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/intakes/${intakeId}/appraisals`,
    body,
    options,
    responseSchema: intakeResponseSchema,
  });
}

export function sealIntake(intakeId: string, options: RequestOptions): Promise<IntakeResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/intakes/${intakeId}/seal`,
    body: {},
    options,
    responseSchema: intakeResponseSchema,
  });
}

export function issueReceipt(
  intakeId: string,
  body: IssueReceiptRequest,
  options: RequestOptions,
): Promise<ReceiptResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/intakes/${intakeId}/issue-receipt`,
    body,
    options,
    responseSchema: receiptResponseSchema,
  });
}

export function fetchInventory(vaultId: string, status?: string): Promise<ReceiptListResponse> {
  const query = status === undefined ? '' : `?status=${status}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/vaults/${vaultId}/inventory${query}`,
    responseSchema: receiptListResponseSchema,
  });
}

export function fetchVaultExposure(vaultId: string): Promise<VaultExposureResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/vaults/${vaultId}/exposure`,
    responseSchema: vaultExposureResponseSchema,
  });
}

export function fetchMyReceipts(): Promise<ReceiptListResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/me/receipts`,
    responseSchema: receiptListResponseSchema,
  });
}

export function fetchReceipt(receiptId: string): Promise<ReceiptResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/receipts/${receiptId}`,
    responseSchema: receiptResponseSchema,
  });
}
