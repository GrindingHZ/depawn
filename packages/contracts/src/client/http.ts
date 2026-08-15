import type { ZodType } from 'zod';
import { ApiError } from './api-error';

export interface RequestOptions {
  readonly idempotencyKey?: string;
}

interface RequestInput {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  readonly options?: RequestOptions;
}

async function performRequest(input: RequestInput): Promise<Response> {
  const headers: Record<string, string> = {};
  if (input.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (input.options?.idempotencyKey !== undefined) {
    headers['idempotency-key'] = input.options.idempotencyKey;
  }

  const requestInit: RequestInit = {
    method: input.method,
    credentials: 'include',
    headers,
  };
  if (input.body !== undefined) {
    requestInit.body = JSON.stringify(input.body);
  }
  const response = await fetch(input.path, requestInit);

  if (!response.ok) {
    throw await toApiError(response);
  }
  return response;
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'object' &&
      body.error !== null &&
      'code' in body.error &&
      typeof body.error.code === 'string'
    ) {
      const message =
        'message' in body.error && typeof body.error.message === 'string'
          ? body.error.message
          : 'The request failed.';
      const details = 'details' in body.error ? body.error.details : undefined;
      return new ApiError(response.status, body.error.code, message, details);
    }
  } catch {
    // A non-JSON error body falls through to the generic error below.
  }
  return new ApiError(response.status, 'FAULT', 'The request failed.');
}

export async function requestJson<T>(
  input: RequestInput & { readonly responseSchema: ZodType<T> },
): Promise<T> {
  const response = await performRequest(input);
  return input.responseSchema.parse(await response.json());
}

export async function requestVoid(input: RequestInput): Promise<void> {
  await performRequest(input);
}

/* Multipart uploads bypass the JSON body path; the browser sets the boundary
   header itself. */
export async function requestMultipart<T>(input: {
  readonly path: string;
  readonly formData: FormData;
  readonly responseSchema: ZodType<T>;
  readonly options?: RequestOptions;
}): Promise<T> {
  const headers: Record<string, string> = {};
  if (input.options?.idempotencyKey !== undefined) {
    headers['idempotency-key'] = input.options.idempotencyKey;
  }
  const response = await fetch(input.path, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: input.formData,
  });
  if (!response.ok) {
    throw await toApiError(response);
  }
  return input.responseSchema.parse(await response.json());
}
