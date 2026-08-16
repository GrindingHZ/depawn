import { auditPageResponseSchema, systemStateResponseSchema } from '../admin';
import type { AuditPageResponse, PauseSystemRequest, SystemStateResponse } from '../admin';
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
  readonly subjectId?: string;
  readonly actorId?: string;
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
    path: `${basePath}/admin/audit${suffix}`,
    responseSchema: auditPageResponseSchema,
  });
}
