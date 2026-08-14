export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;
  verify(passwordHash: string, plainPassword: string): Promise<boolean>;
}

export const PASSWORD_HASHER = Symbol('PasswordHasher');
