import { describe, expect, it } from 'vitest';
import { Instant } from '../../../domain/shared/instant';
import { LoginUseCase } from './login.use-case';
import { RegisterAccountUseCase } from './register-account.use-case';
import { defaultSessionLifetimeMs } from './session-lifetime';
import {
  CountingIdGenerator,
  InMemoryAccountRepository,
  InMemorySessionRepository,
  PredictableTokenIssuer,
  ReversingPasswordHasher,
  StoppedClock,
  passThroughUnitOfWork,
} from './test-support/account-fakes';

const start = Instant.fromEpochMilliseconds(1_700_000_000_000n);

function createSubject(): {
  login: LoginUseCase;
  register: RegisterAccountUseCase;
  sessions: InMemorySessionRepository;
} {
  const accounts = new InMemoryAccountRepository();
  const sessions = new InMemorySessionRepository();
  const hasher = new ReversingPasswordHasher();
  const ids = new CountingIdGenerator();
  const register = new RegisterAccountUseCase(passThroughUnitOfWork, accounts, hasher, ids);
  const login = new LoginUseCase(
    passThroughUnitOfWork,
    accounts,
    sessions,
    hasher,
    new PredictableTokenIssuer(),
    ids,
    new StoppedClock(start),
    defaultSessionLifetimeMs,
  );
  return { login, register, sessions };
}

describe('LoginUseCase', () => {
  const credentials = { email: 'a@example.test', password: 'long-password' };

  it('issues a session that expires one lifetime after now', async () => {
    const { login, register, sessions } = createSubject();
    await register.execute(credentials);

    const result = await login.execute(credentials);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sessionToken).toBe('raw-token');
      expect(result.value.expiresAt.millisecondsSince(start)).toBe(defaultSessionLifetimeMs);
      expect(await sessions.findByTokenHash('hashed:raw-token')).not.toBeNull();
    }
  });

  it('rejects an unknown email', async () => {
    const { login } = createSubject();
    const result = await login.execute(credentials);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('rejects a wrong password', async () => {
    const { login, register } = createSubject();
    await register.execute(credentials);
    const result = await login.execute({ ...credentials, password: 'wrong-password' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNAUTHENTICATED');
    }
  });
});
