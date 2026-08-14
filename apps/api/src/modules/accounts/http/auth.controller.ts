import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { loginRequestSchema, registerRequestSchema } from '@depawn/contracts';
import type { AccountResponse, LoginRequest, RegisterRequest } from '@depawn/contracts';
import { LoginUseCase } from '../application/login.use-case';
import { LogoutUseCase } from '../application/logout.use-case';
import { RegisterAccountUseCase } from '../application/register-account.use-case';
import { DomainErrorHttpException } from '../../shared/http/domain-error-http.exception';
import { Public } from '../../shared/http/public.decorator';
import { SESSION_COOKIE_NAME } from '../../shared/http/session-cookie';
import { ZodValidationPipe } from '../../shared/http/zod-validation.pipe';
import { toAccountResponse } from './account-response.mapper';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly registerAccount: RegisterAccountUseCase,
    private readonly login: LoginUseCase,
    private readonly logout: LogoutUseCase,
  ) {}

  @Public()
  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerRequestSchema)) body: RegisterRequest,
  ): Promise<AccountResponse> {
    const result = await this.registerAccount.execute(body);
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, 409);
    }
    return toAccountResponse(result.value);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async loginWithPassword(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AccountResponse> {
    const result = await this.login.execute(body);
    if (!result.ok) {
      throw new DomainErrorHttpException(result.error, 401);
    }

    response.cookie(SESSION_COOKIE_NAME, result.value.sessionToken, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      expires: new Date(Number(result.value.expiresAt.epochMilliseconds)),
    });
    return toAccountResponse(result.value.account);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logoutSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies: Record<string, string | undefined> = request.cookies ?? {};
    const sessionToken = cookies[SESSION_COOKIE_NAME];
    if (sessionToken !== undefined && sessionToken !== '') {
      await this.logout.execute(sessionToken);
    }
    response.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }
}
