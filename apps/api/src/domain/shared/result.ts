import type { DomainError } from './domain-error';

export type Result<T, E extends DomainError> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

export function failure<E extends DomainError>(
  error: E,
): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
