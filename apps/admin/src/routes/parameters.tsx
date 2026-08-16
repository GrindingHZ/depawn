import {
  fetchDeadLetters,
  fetchProtocolParameters,
  updateProtocolParameters,
} from '@depawn/contracts';
import type { DeadLetterRowResponse, ParameterVersionResponse } from '@depawn/contracts';
import { AppShell, Button, Card, DataTable, Field, Skeleton } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';

export const Route = createFileRoute('/parameters')({
  component: ParametersPage,
});

const parameterKeys = {
  parameters: ['protocol-parameters'] as const,
  deadLetters: ['dead-letters'] as const,
};

function ParametersPage(): ReactElement | null {
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
          Operations tools require the operations role.
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
          <Link to="/liquidations" className="font-body text-sm text-ink-secondary">
            Liquidations
          </Link>
          <Link to="/operations" className="font-body text-sm text-ink-secondary">
            Operations
          </Link>
          <Link to="/parameters" className="font-body text-sm text-ink-primary">
            Parameters
          </Link>
          <Link to="/reconciliation" className="font-body text-sm text-ink-secondary">
            Reconciliation
          </Link>
          <Link to="/deposits" className="font-body text-sm text-ink-secondary">
            Deposits
          </Link>
        </>
      }
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <ParametersCard />
        <DeadLetterCard />
      </div>
    </AppShell>
  );
}

function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

function ParametersCard(): ReactElement {
  const queryClient = useQueryClient();
  const [originationFee, setOriginationFee] = useState('');
  const [liquidationFee, setLiquidationFee] = useState('');
  const [effectiveAt, setEffectiveAt] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const parametersQuery = useQuery({
    queryKey: parameterKeys.parameters,
    queryFn: fetchProtocolParameters,
  });

  const editMutation = useMutation({
    mutationFn: (body: { effectiveAt: string; originationFee: number; liquidationFee: number }) => {
      const current = parametersQuery.data?.current;
      if (current === undefined) {
        throw new Error('the parameters must be loaded before they can be edited');
      }
      return updateProtocolParameters(
        {
          effectiveAt: body.effectiveAt,
          parameters: {
            ...current,
            originationFeeBasisPoints: body.originationFee,
            liquidationFeeBasisPoints: body.liquidationFee,
          },
        },
        { idempotencyKey },
      );
    },
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      setOriginationFee('');
      setLiquidationFee('');
      setEffectiveAt('');
      await queryClient.invalidateQueries({ queryKey: parameterKeys.parameters });
    },
  });

  if (parametersQuery.isPending) {
    return (
      <Card title="Protocol parameters">
        <Skeleton lineCount={5} />
      </Card>
    );
  }
  if (parametersQuery.isError || parametersQuery.data === undefined) {
    return (
      <Card title="Protocol parameters">
        <p role="alert" className="font-body text-sm text-status-danger">
          The parameters could not be loaded.
        </p>
      </Card>
    );
  }

  const current = parametersQuery.data.current;
  return (
    <Card title="Protocol parameters">
      <div data-testid="current-parameters" className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-2 font-body text-sm">
          <dt className="text-ink-secondary">Origination fee</dt>
          <dd data-testid="origination-fee" className="text-ink-primary">
            {current.originationFeeBasisPoints} bps
          </dd>
          <dt className="text-ink-secondary">Liquidation fee</dt>
          <dd data-testid="liquidation-fee" className="text-ink-primary">
            {current.liquidationFeeBasisPoints} bps
          </dd>
          <dt className="text-ink-secondary">Grace period</dt>
          <dd className="text-ink-primary">{current.gracePeriodMs / 86_400_000} days</dd>
          <dt className="text-ink-secondary">Statutory holding period</dt>
          <dd className="text-ink-primary">{current.statutoryHoldingPeriodMs / 86_400_000} days</dd>
        </dl>
        <p className="font-body text-sm text-ink-secondary">
          An edit writes a new version from the instant you choose. A loan already originated keeps
          the terms it was originated under, including the fee its liquidation would pay.
        </p>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const origination = Number(originationFee);
            const liquidation = Number(liquidationFee);
            const isBasisPoints = (value: number): boolean =>
              Number.isInteger(value) && value >= 0 && value <= 10_000;
            if (!isBasisPoints(origination) || !isBasisPoints(liquidation)) {
              setFormError('Fees are whole basis points between 0 and 10000.');
              return;
            }
            if (effectiveAt === '') {
              setFormError('Say when the new version takes effect.');
              return;
            }
            setFormError(null);
            editMutation.mutate({
              effectiveAt: new Date(effectiveAt).toISOString(),
              originationFee: origination,
              liquidationFee: liquidation,
            });
          }}
        >
          <Field
            label="Origination fee bps"
            data-testid="edit-origination-fee"
            value={originationFee}
            onChange={(event) => setOriginationFee(event.target.value)}
          />
          <Field
            label="Liquidation fee bps"
            data-testid="edit-liquidation-fee"
            value={liquidationFee}
            onChange={(event) => setLiquidationFee(event.target.value)}
          />
          <Field
            label="Effective from"
            type="datetime-local"
            data-testid="edit-effective-at"
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            errorMessage={formError ?? undefined}
          />
          <Button data-testid="save-parameters" type="submit" disabled={editMutation.isPending}>
            Save version
          </Button>
        </form>
        {editMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The version could not be saved.
          </p>
        ) : null}
        <div data-testid="parameter-history">
          <DataTable<ParameterVersionResponse>
            columns={[
              {
                key: 'effectiveAt',
                header: 'Effective from',
                render: (row) => toLocalInput(row.effectiveAt).replace('T', ' '),
              },
              {
                key: 'origination',
                header: 'Origination fee',
                render: (row) => `${row.parameters.originationFeeBasisPoints} bps`,
              },
              {
                key: 'liquidation',
                header: 'Liquidation fee',
                render: (row) => `${row.parameters.liquidationFeeBasisPoints} bps`,
              },
              { key: 'writtenBy', header: 'Written by', render: (row) => row.writtenByAccountId },
            ]}
            rows={parametersQuery.data.history}
            rowKey={(row) => row.id}
            emptyTitle="No edits yet. The demo defaults are still in force."
          />
        </div>
      </div>
    </Card>
  );
}

function DeadLetterCard(): ReactElement {
  const deadLetterQuery = useQuery({
    queryKey: parameterKeys.deadLetters,
    queryFn: fetchDeadLetters,
  });

  return (
    <Card title="Dead letters">
      {deadLetterQuery.isPending ? (
        <Skeleton lineCount={3} />
      ) : deadLetterQuery.isError || deadLetterQuery.data === undefined ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          The dead letters could not be loaded.
        </p>
      ) : (
        <div data-testid="dead-letters">
          <DataTable<DeadLetterRowResponse>
            columns={[
              { key: 'type', header: 'Event', render: (row) => row.type },
              { key: 'attempts', header: 'Attempts', render: (row) => row.attempts },
              { key: 'lastError', header: 'Last error', render: (row) => row.lastError },
              {
                key: 'when',
                header: 'Gave up',
                render: (row) => toLocalInput(row.deadLetteredAt).replace('T', ' '),
              },
            ]}
            rows={deadLetterQuery.data.items}
            rowKey={(row) => row.id}
            emptyTitle="Nothing has given up on delivery."
          />
        </div>
      )}
    </Card>
  );
}
