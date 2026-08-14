import { ApiError, deposit } from '@depawn/contracts';
import { AppShell, Button, Card, Field, Skeleton } from '@depawn/ui';
import { useMutation } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { toMinorUnits } from '../money-input';

export const Route = createFileRoute('/deposits')({
  component: DepositsPage,
});

function depositMessageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return 'No account exists for this email.';
  }
  return 'The request failed. Try again.';
}

function DepositsPage(): ReactElement | null {
  const currentAccount = useCurrentAccount();

  if (currentAccount.isPending) {
    return (
      <main className="p-6">
        <Skeleton lineCount={4} />
      </main>
    );
  }
  if (currentAccount.data === null || currentAccount.data === undefined) {
    return <Navigate to="/login" />;
  }
  if (!currentAccount.data.roles.includes('OPERATIONS')) {
    return (
      <main className="p-6">
        <p data-testid="access-denied" className="font-body text-sm text-ink-primary">
          Deposits require the operations role.
        </p>
      </main>
    );
  }

  return (
    <AppShell
      productName="depawn admin"
      navigation={
        <>
          <Link to="/" className="font-body text-sm text-ink-secondary">
            Home
          </Link>
          <Link to="/deposits" className="font-body text-sm text-ink-primary">
            Deposits
          </Link>
        </>
      }
    >
      <div className="max-w-md">
        <DepositCard />
      </div>
    </AppShell>
  );
}

function DepositCard(): ReactElement {
  const [email, setEmail] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [lastReference, setLastReference] = useState<string | null>(null);

  const depositMutation = useMutation({
    mutationFn: (minorUnits: string) =>
      deposit({ email, amount: { minorUnits, currency: 'AUD' } }, { idempotencyKey }),
    onSuccess: (response) => {
      setLastReference(response.settlementRef.reference);
      setAmountInput('');
      setIdempotencyKey(crypto.randomUUID());
    },
  });

  return (
    <Card title="Deposit funds">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(amountInput);
          if (minorUnits === null) {
            setInputError('Enter an amount like 2500 or 2500.00.');
            return;
          }
          setInputError(null);
          depositMutation.mutate(minorUnits);
        }}
      >
        <Field
          label="Member email"
          type="email"
          data-testid="deposit-email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Field
          label="Amount (AUD)"
          data-testid="deposit-amount"
          value={amountInput}
          onChange={(event) => setAmountInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Button data-testid="deposit-submit" type="submit" disabled={depositMutation.isPending}>
          Deposit
        </Button>
        {depositMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {depositMessageFor(depositMutation.error)}
          </p>
        ) : null}
        {lastReference === null ? null : (
          <p className="font-body text-sm text-ink-secondary">
            Settled with reference{' '}
            <span data-testid="deposit-reference" className="font-mono text-xs">
              {lastReference}
            </span>
          </p>
        )}
      </form>
    </Card>
  );
}
