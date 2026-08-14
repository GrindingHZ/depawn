import { Inject, Injectable } from '@nestjs/common';
import { Account } from '../../../domain/accounts/account';
import { ACCOUNT_REPOSITORY } from '../../../domain/accounts/account-repository';
import type { AccountRepository } from '../../../domain/accounts/account-repository';
import { EmailAlreadyRegistered } from '../../../domain/accounts/email-already-registered';
import { PASSWORD_HASHER } from '../../../domain/accounts/password-hasher';
import type { PasswordHasher } from '../../../domain/accounts/password-hasher';
import { ID_GENERATOR } from '../../../domain/shared/id-generator';
import type { IdGenerator } from '../../../domain/shared/id-generator';
import { accountIdOf } from '../../../domain/shared/identifiers';
import { failure, ok } from '../../../domain/shared/result';
import type { Result } from '../../../domain/shared/result';
import { UNIT_OF_WORK } from '../../../domain/ports/unit-of-work';
import type { UnitOfWork } from '../../../domain/ports/unit-of-work';

export interface RegisterAccountCommand {
  readonly email: string;
  readonly password: string;
}

@Injectable()
export class RegisterAccountUseCase {
  constructor(
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(PASSWORD_HASHER) private readonly passwordHasher: PasswordHasher,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  execute(command: RegisterAccountCommand): Promise<Result<Account, EmailAlreadyRegistered>> {
    return this.unitOfWork.run(async (context) => {
      const existing = await this.accounts.findByEmail(command.email, context);
      if (existing !== null) {
        return failure(new EmailAlreadyRegistered());
      }

      const account = Account.create({
        id: accountIdOf(this.idGenerator.generate()),
        email: command.email,
        passwordHash: await this.passwordHasher.hash(command.password),
      });
      await this.accounts.save(account, context);
      return ok(account);
    });
  }
}
