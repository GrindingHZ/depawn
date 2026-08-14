import { describe, expect, it } from 'vitest';
import { RegisterAccountUseCase } from './register-account.use-case';
import {
  CountingIdGenerator,
  InMemoryAccountRepository,
  ReversingPasswordHasher,
  passThroughUnitOfWork,
} from './test-support/account-fakes';

function createSubject(): { useCase: RegisterAccountUseCase; accounts: InMemoryAccountRepository } {
  const accounts = new InMemoryAccountRepository();
  const useCase = new RegisterAccountUseCase(
    passThroughUnitOfWork,
    accounts,
    new ReversingPasswordHasher(),
    new CountingIdGenerator(),
  );
  return { useCase, accounts };
}

describe('RegisterAccountUseCase', () => {
  it('creates a member account with a hashed password', async () => {
    const { useCase } = createSubject();
    const result = await useCase.execute({ email: 'a@example.test', password: 'long-password' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.roles).toEqual(['MEMBER']);
      expect(result.value.passwordHash).not.toContain('long-password');
    }
  });

  it('rejects a duplicate email', async () => {
    const { useCase } = createSubject();
    await useCase.execute({ email: 'a@example.test', password: 'long-password' });
    const result = await useCase.execute({ email: 'A@Example.Test', password: 'other-password' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    }
  });
});
