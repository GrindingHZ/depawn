import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Account } from '../../../domain/accounts/account';

export interface AuthenticatedRequest extends Request {
  account?: Account;
}

export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Account => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.account === undefined) {
      throw new Error('CurrentAccount used on a route the auth guard did not protect');
    }
    return request.account;
  },
);
