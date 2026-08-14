import { describe, expect, it } from 'vitest';
import { DomainError } from './domain-error';
import { failure, ok } from './result';
import type { Result } from './result';

class ListingNotActive extends DomainError {
  readonly code = 'LISTING_NOT_ACTIVE';
}

describe('Result', () => {
  it('narrows to the value on ok', () => {
    const result: Result<number, ListingNotActive> = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('narrows to the error on failure', () => {
    const result: Result<number, ListingNotActive> = failure(
      new ListingNotActive('The listing is not active.'),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('LISTING_NOT_ACTIVE');
      expect(result.error.message).toBe('The listing is not active.');
    }
  });
});
