import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../../domain/accounts/account';

export const REQUIRED_ROLES = 'requiredRoles';

export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES, roles);
