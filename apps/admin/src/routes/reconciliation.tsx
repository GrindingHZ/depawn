import {
  fetchExposureByVault,
  fetchLoanBook,
  fetchLatestReconciliation,
  runReconciliation,
} from '@depawn/contracts';
import type { DriftRowResponse, ReconciliationRunResponse } from '@depawn/contracts';
import { AppShell, Button, Card, DataTable, Field, Money, Skeleton, StatusBadge } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';

export const Route = createFileRoute('/reconciliation')({
  component: ReconciliationPage,
});

const reconciliationKeys = {
  latestRun: ['reconciliation', 'latest'] as const,
  loanBook: ['loan-book'] as const,
  exposure: ['exposure-by-vault'] as const,
};

const demoVaultId = 'VAULT-DEMO-1';

function ReconciliationPage(): ReactElement | null {
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
          Reconciliation requires the operations role.
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
          <Link to="/reconciliation" className="font-body text-sm text-ink-primary">
            Reconciliation
          </Link>
          <Link to="/liquidations" className="font-body text-sm text-ink-secondary">
            Liquidations
          </Link>
          <Link to="/operations" className="font-body text-sm text-ink-secondary">
            Operations
          </Link>
          <Link to="/deposits" className="font-body text-sm text-ink-secondary">
            Deposits
          </Link>
        </>
      }
    >
      <div className="flex max-w-5xl flex-col gap-6">
        <LoanBookCard />
        <ExposureCard />
        <ReconciliationCard />
      </div>
    </AppShell>
  );
}

function LoanBookCard(): ReactElement {
  const bookQuery = useQuery({ queryKey: reconciliationKeys.loanBook, queryFn: fetchLoanBook });

  if (bookQuery.isPending) {
    return (
      <Card title="Loan book">
        <Skeleton lineCount={2} />
      </Card>
    );
  }
  if (bookQuery.isError || bookQuery.data === undefined) {
    return (
      <Card title="Loan book">
        <p role="alert" className="font-body text-sm text-status-danger">
          The loan book could not be loaded.
        </p>
      </Card>
    );
  }

  const book = bookQuery.data;
  return (
    <Card title="Loan book">
      <dl data-testid="loan-book" className="flex flex-wrap gap-8">
        <div>
          <dt className="font-body text-sm text-ink-secondary">Outstanding</dt>
          <dd data-testid="outstanding-count" className="text-lg">
            {book.outstandingCount}
          </dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Principal at work</dt>
          <dd>
            <Money value={book.outstandingPrincipal} />
          </dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Overdue, in grace</dt>
          <dd>{book.overdueCount}</dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Past grace</dt>
          <dd data-testid="at-risk-count">{book.atRiskCount}</dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Defaulted</dt>
          <dd>{book.defaultedCount}</dd>
        </div>
      </dl>
    </Card>
  );
}

function ExposureCard(): ReactElement {
  const exposureQuery = useQuery({
    queryKey: reconciliationKeys.exposure,
    queryFn: fetchExposureByVault,
  });

  if (exposureQuery.isPending) {
    return (
      <Card title="Exposure by vault">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (exposureQuery.isError || exposureQuery.data === undefined) {
    return (
      <Card title="Exposure by vault">
        <p role="alert" className="font-body text-sm text-status-danger">
          The exposure could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Exposure by vault">
      <div data-testid="exposure-table">
        <DataTable
          columns={[
            { key: 'vault', header: 'Vault', render: (row) => row.vaultId },
            {
              key: 'exposure',
              header: 'Insured value held',
              render: (row) => <Money value={row.exposure} />,
            },
            {
              key: 'limit',
              header: 'Insured limit',
              render: (row) => <Money value={row.insuredLimit} />,
            },
            { key: 'count', header: 'Items', render: (row) => row.receiptCount },
          ]}
          rows={exposureQuery.data.items}
          rowKey={(row) => row.vaultId}
          emptyTitle="No vaults"
        />
      </div>
    </Card>
  );
}

function ReconciliationCard(): ReactElement {
  const queryClient = useQueryClient();
  const [countInput, setCountInput] = useState('');
  const [runKey, setRunKey] = useState(() => crypto.randomUUID());
  const latestQuery = useQuery({
    queryKey: reconciliationKeys.latestRun,
    queryFn: fetchLatestReconciliation,
  });

  const runMutation = useMutation({
    mutationFn: (countedReceiptIds: readonly string[]) =>
      runReconciliation(
        { vaultId: demoVaultId, countedReceiptIds: [...countedReceiptIds] },
        { idempotencyKey: runKey },
      ),
    onSuccess: async () => {
      setRunKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: reconciliationKeys.latestRun });
    },
  });

  return (
    <Card title="Reconciliation">
      <p className="mb-3 font-body text-sm text-ink-secondary">
        Paste the receipt ids counted on the floor, one per line. Anything the records and the count
        disagree about becomes a drift row to investigate, not a number to file.
      </p>
      <form
        className="mb-4 flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const counted = countInput
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line !== '');
          runMutation.mutate(counted);
        }}
      >
        <Field
          label="Counted receipt ids"
          data-testid="counted-receipts"
          value={countInput}
          onChange={(event) => setCountInput(event.target.value)}
        />
        <Button data-testid="run-reconciliation" type="submit" disabled={runMutation.isPending}>
          Reconcile the vault
        </Button>
      </form>
      {runMutation.isError ? (
        <p role="alert" className="mb-3 font-body text-sm text-status-danger">
          The reconciliation could not be run.
        </p>
      ) : null}

      {latestQuery.isPending ? (
        <Skeleton lineCount={4} />
      ) : latestQuery.isError || latestQuery.data === undefined ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          The last reconciliation could not be loaded.
        </p>
      ) : (
        <div data-testid="reconciliation-runs" className="flex flex-col gap-4">
          {latestQuery.data.run === null ? (
            <p className="font-body text-sm text-ink-secondary">No runs yet</p>
          ) : (
            <LatestRun run={latestQuery.data.run} />
          )}
        </div>
      )}
    </Card>
  );
}

function LatestRun({ run }: { readonly run: ReconciliationRunResponse }): ReactElement {
  return (
    <div className="rounded-md border border-line p-4">
      <div className="mb-2 flex items-center gap-3">
        <StatusBadge
          tone={run.drift.length === 0 ? 'success' : 'danger'}
          label={run.drift.length === 0 ? 'CLEAN' : `${run.drift.length} DRIFT`}
        />
        <span className="font-body text-sm text-ink-secondary">
          {run.vaultId ?? 'every vault'} on {run.startedAt.slice(0, 19)}
        </span>
      </div>
      {run.drift.length === 0 ? null : (
        <DataTable
          columns={[
            { key: 'kind', header: 'Kind', render: (row: DriftRowResponse) => row.kind },
            {
              key: 'subject',
              header: 'Subject',
              render: (row: DriftRowResponse) => (
                <span className="font-mono text-xs">{row.subject}</span>
              ),
            },
            {
              key: 'expected',
              header: 'Records say',
              render: (row: DriftRowResponse) => row.expected,
            },
            {
              key: 'observed',
              header: 'Count says',
              render: (row: DriftRowResponse) => row.observed,
            },
          ]}
          rows={[...run.drift]}
          rowKey={(row) => `${run.id}-${row.subject}-${row.kind}`}
          emptyTitle="No drift"
        />
      )}
    </div>
  );
}
