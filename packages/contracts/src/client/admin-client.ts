import {
  advanceClockResponseSchema,
  auditPageResponseSchema,
  healthResponseSchema,
  systemStateResponseSchema,
} from '../admin';
import {
  deadLettersResponseSchema,
  exposureByVaultResponseSchema,
  loanBookResponseSchema,
  latestReconciliationResponseSchema,
  reconciliationRunResponseSchema,
} from '../operations';
import type {
  DeadLettersResponse,
  ExposureByVaultResponse,
  LoanBookResponse,
  ReconcileRequest,
  LatestReconciliationResponse,
  ReconciliationRunResponse,
} from '../operations';
import type {
  AdvanceClockRequest,
  AdvanceClockResponse,
  AuditPageResponse,
  HealthResponse,
  PauseSystemRequest,
  SystemStateResponse,
} from '../admin';
import { protocolParametersResponseSchema } from '../parameters';
import type { ProtocolParametersResponse, UpdateParametersRequest } from '../parameters';
import { requestJson } from './http';
import type { RequestOptions } from './http';

const basePath = '/api/v1';

export function fetchSystemState(): Promise<SystemStateResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/system-state`,
    responseSchema: systemStateResponseSchema,
  });
}

export function pauseSystem(
  body: PauseSystemRequest,
  options: RequestOptions,
): Promise<SystemStateResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/admin/pause`,
    body,
    options,
    responseSchema: systemStateResponseSchema,
  });
}

export function unpauseSystem(options: RequestOptions): Promise<SystemStateResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/admin/unpause`,
    body: {},
    options,
    responseSchema: systemStateResponseSchema,
  });
}

export function fetchAuditPage(filters: {
  readonly subjectType?: string;
  readonly subject?: string;
  readonly actor?: string;
  readonly cursor?: string;
}): Promise<AuditPageResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') {
      query.set(key, value);
    }
  }
  const suffix = query.toString() === '' ? '' : `?${query.toString()}`;
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/audit-log${suffix}`,
    responseSchema: auditPageResponseSchema,
  });
}

export function runReconciliation(
  body: ReconcileRequest,
  options: RequestOptions,
): Promise<ReconciliationRunResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/admin/reconciliation/run`,
    body,
    options,
    responseSchema: reconciliationRunResponseSchema,
  });
}

export function fetchLatestReconciliation(): Promise<LatestReconciliationResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/reconciliation/latest`,
    responseSchema: latestReconciliationResponseSchema,
  });
}

export function fetchLoanBook(): Promise<LoanBookResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/loan-book`,
    responseSchema: loanBookResponseSchema,
  });
}

export function fetchExposureByVault(): Promise<ExposureByVaultResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/exposure-by-vault`,
    responseSchema: exposureByVaultResponseSchema,
  });
}

export function fetchProtocolParameters(): Promise<ProtocolParametersResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/protocol-parameters`,
    responseSchema: protocolParametersResponseSchema,
  });
}

export function updateProtocolParameters(
  body: UpdateParametersRequest,
  options: RequestOptions,
): Promise<ProtocolParametersResponse> {
  return requestJson({
    method: 'PUT',
    path: `${basePath}/admin/protocol-parameters`,
    body,
    options,
    responseSchema: protocolParametersResponseSchema,
  });
}

export function fetchDeadLetters(): Promise<DeadLettersResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/admin/dead-letters`,
    responseSchema: deadLettersResponseSchema,
  });
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson({
    method: 'GET',
    path: `${basePath}/health`,
    responseSchema: healthResponseSchema,
  });
}

/* Present only in a demo or under test. A deployed process has no such route,
   which is why the screen asks health before it offers the control. */
export function advanceClock(body: AdvanceClockRequest): Promise<AdvanceClockResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/test/clock/advance`,
    body,
    responseSchema: advanceClockResponseSchema,
  });
}
