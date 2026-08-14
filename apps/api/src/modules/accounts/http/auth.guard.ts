import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '../../../domain/accounts/account';
import { ResolveSessionUseCase } from '../application/resolve-session.use-case';
import type { AuthenticatedRequest } from '../../shared/http/current-account.decorator';
import { IS_PUBLIC_ROUTE } from '../../shared/http/public.decorator';
import { REQUIRED_ROLES } from '../../shared/http/roles.decorator';
import { SESSION_COOKIE_NAME } from '../../shared/http/session-cookie';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ResolveSessionUseCase) private readonly resolveSession: ResolveSessionUseCase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies: Record<string, string | undefined> = request.cookies ?? {};
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (sessionToken === undefined || sessionToken === '') {
      throw new UnauthorizedException();
    }

    const account = await this.resolveSession.execute(sessionToken);
    if (account === null) {
      throw new UnauthorizedException();
    }
    request.account = account;

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (
      requiredRoles !== undefined &&
      requiredRoles.length > 0 &&
      !account.hasAnyRole(requiredRoles)
    ) {
      throw new ForbiddenException();
    }

    return true;
  }
}
