import { ApiError, login, loginRequestSchema } from '@depawn/contracts';
import type { LoginRequest } from '@depawn/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';
import { currentAccountKeys } from '../current-account';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') {
    return 'Email or password is incorrect.';
  }
  return 'The request failed. Try again.';
}

function LoginPage(): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useForm<LoginRequest>({ resolver: zodResolver(loginRequestSchema) });
  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: currentAccountKeys.me });
      await navigate({ to: '/' });
    },
  });

  return (
    <main>
      <h1>Log in</h1>
      <form
        onSubmit={form.handleSubmit((values) => {
          loginMutation.mutate(values);
        })}
      >
        <label>
          Email
          <input data-testid="email-input" type="email" {...form.register('email')} />
        </label>
        {form.formState.errors.email === undefined ? null : (
          <p role="alert">{form.formState.errors.email.message}</p>
        )}
        <label>
          Password
          <input data-testid="password-input" type="password" {...form.register('password')} />
        </label>
        {form.formState.errors.password === undefined ? null : (
          <p role="alert">{form.formState.errors.password.message}</p>
        )}
        <button data-testid="login-submit" type="submit" disabled={loginMutation.isPending}>
          Log in
        </button>
        {loginMutation.isError ? <p role="alert">{messageFor(loginMutation.error)}</p> : null}
      </form>
    </main>
  );
}
