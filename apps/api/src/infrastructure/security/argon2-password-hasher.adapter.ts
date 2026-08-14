import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../../domain/accounts/password-hasher';

@Injectable()
export class Argon2PasswordHasherAdapter implements PasswordHasher {
  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      // An unparseable hash means the credential cannot match; it is not a fault.
      return false;
    }
  }
}
