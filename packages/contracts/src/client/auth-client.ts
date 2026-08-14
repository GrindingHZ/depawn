import { accountResponseSchema } from '../auth';
import type { AccountResponse, LoginRequest, RegisterRequest } from '../auth';
import { ApiError } from './api-error';
import { requestJson, requestVoid } from './http';

const basePath = '/api/v1';

export function register(body: RegisterRequest): Promise<AccountResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/auth/register`,
    body,
    responseSchema: accountResponseSchema,
  });
}

export function login(body: LoginRequest): Promise<AccountResponse> {
  return requestJson({
    method: 'POST',
    path: `${basePath}/auth/login`,
    body,
    responseSchema: accountResponseSchema,
  });
}

export function logout(): Promise<void> {
  return requestVoid({ method: 'POST', path: `${basePath}/auth/logout` });
}

export async function fetchCurrentAccount(): Promise<AccountResponse | null> {
  try {
    return await requestJson({
      method: 'GET',
      path: `${basePath}/me`,
      responseSchema: accountResponseSchema,
    });
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 401) {
      return null;
    }
    throw error;
  }
}
