import type { LoanResponse } from '@depawn/contracts';
import { Card, DataTable, Money, Rate, Skeleton, StatusBadge } from '@depawn/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { loanStatusTone } from './loan-status-tone';

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/* Both sides of a loan read the same columns; only the title, the test id,
   and the empty state differ. */
export function LoansTable({
  title,
  testId,
  emptyTitle,
  query,
  footnote,
}: {
  readonly title: string;
  readonly testId: string;
  readonly emptyTitle: string;
  readonly query: UseQueryResult<{ readonly items: readonly LoanResponse[] }>;
  readonly footnote: string;
}): ReactElement {
  if (query.isPending) {
    return (
      <Card title={title}>
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (query.isError || query.data === undefined) {
    return (
      <Card title={title}>
        <p role="alert" className="font-body text-sm text-status-danger">
          Your loans could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title={title}>
      <div data-testid={testId}>
        <DataTable
          columns={[
            {
              key: 'principal',
              header: 'Principal',
              render: (loan: LoanResponse) => <Money value={loan.principal} />,
            },
            {
              key: 'rate',
              header: 'Rate',
              render: (loan: LoanResponse) => (
                <Rate basisPoints={loan.annualPercentageRateBasisPoints} />
              ),
            },
            {
              key: 'started',
              header: 'Started',
              render: (loan: LoanResponse) => dayOf(loan.startedAt),
            },
            {
              key: 'matures',
              header: 'Matures',
              render: (loan: LoanResponse) => dayOf(loan.maturesAt),
            },
            {
              key: 'grace',
              header: 'Grace ends',
              render: (loan: LoanResponse) => dayOf(loan.graceEndsAt),
            },
            {
              key: 'status',
              header: 'Status',
              render: (loan: LoanResponse) => (
                <StatusBadge tone={loanStatusTone(loan.status)} label={loan.status} />
              ),
            },
          ]}
          rows={[...query.data.items]}
          rowKey={(loan) => loan.id}
          emptyTitle={emptyTitle}
        />
      </div>
      <p className="mt-3 font-body text-sm text-ink-secondary">{footnote}</p>
    </Card>
  );
}
