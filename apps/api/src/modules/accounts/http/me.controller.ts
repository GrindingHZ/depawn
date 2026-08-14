import { Controller, Get } from '@nestjs/common';
import type { AccountResponse } from '@depawn/contracts';
import type { Account } from '../../../domain/accounts/account';
import { CurrentAccount } from '../../shared/http/current-account.decorator';
import { toAccountResponse } from './account-response.mapper';

@Controller('me')
export class MeController {
  @Get()
  read(@CurrentAccount() account: Account): AccountResponse {
    return toAccountResponse(account);
  }
}
