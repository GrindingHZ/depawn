import { ApiError, login, loginRequestSchema } from '@depawn/contracts';
import type { LoginRequest } from '@depawn/contracts';
import { Button, Card, Field } from '@depawn/ui';
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
    <main className="flex min-h-screen items-center justify-center bg-surface-base p-4">
      <div className="w-full max-w-sm">
        <Card title="Log in">
          <form
            className="flex flex-col gap-4"
            onSubmit={form.handleSubmit((values) => {
              loginMutation.mutate(values);
            })}
          >
            <Field
              label="Email"
              type="email"
              data-testid="email-input"
              errorMessage={form.formState.errors.email?.message}
              {...form.register('email')}
            />
            <Field
              label="Password"
              type="password"
              data-testid="password-input"
              errorMessage={form.formState.errors.password?.message}
              {...form.register('password')}
            />
            <Button data-testid="login-submit" type="submit" disabled={loginMutation.isPending}>
              Log in
            </Button>
            {loginMutation.isError ? (
              <p role="alert" className="font-body text-sm text-status-danger">
                {messageFor(loginMutation.error)}
              </p>
            ) : null}
          </form>
        </Card>
      </div>
    </main>
  );
}
