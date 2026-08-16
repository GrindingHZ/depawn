import type { LoanResponse } from '@depawn/contracts';
import { Card, DataTable, Explain, Money, Rate, Skeleton, StatusBadge } from '@depawn/ui';
import type { GlossaryAudience } from '@depawn/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { loanBadgeFor } from './loan-status-tone';

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

/* Both sides of a loan read the same columns; only the title, the test id,
   and the empty state differ. */
export function LoansTable({
  title,
  testId,
  audience,
  emptyTitle,
  query,
  footnote,
}: {
  readonly title: string;
  readonly testId: string;
  /* Which side of the loan is reading, so the explanations say the right
     thing: grace is protection to a borrower and a delay to a lender. */
  readonly audience: GlossaryAudience;
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
            /* The item first, because a loan the reader can identify is a
               loan they can act on; a column of principals all reads alike. */
            {
              key: 'item',
              header: 'Item',
              render: (loan: LoanResponse) => (
                <span className="block max-w-[16rem] truncate font-body text-sm text-ink-primary">
                  {loan.itemDescription}
                </span>
              ),
            },
            {
              key: 'principal',
              header: 'Principal',
              render: (loan: LoanResponse) => (
                <span className="font-mono font-semibold tabular-nums">
                  <Money value={loan.principal} />
                </span>
              ),
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
              render: (loan: LoanResponse) => (
                <span className="font-mono tabular-nums">{dayOf(loan.startedAt)}</span>
              ),
            },
            {
              key: 'matures',
              header: (
                <span className="inline-flex items-center">
                  Matures
                  <Explain termId="maturity" audience={audience} />
                </span>
              ),
              render: (loan: LoanResponse) => (
                <span className="font-mono tabular-nums">{dayOf(loan.maturesAt)}</span>
              ),
            },
            {
              key: 'grace',
              header: (
                <span className="inline-flex items-center">
                  Grace ends
                  <Explain termId="gracePeriod" audience={audience} />
                </span>
              ),
              render: (loan: LoanResponse) => (
                <span className="font-mono tabular-nums">{dayOf(loan.graceEndsAt)}</span>
              ),
            },
            {
              key: 'status',
              header: 'Status',
              render: (loan: LoanResponse) => {
                const badge = loanBadgeFor(loan, Date.now());
                return <StatusBadge tone={badge.tone} label={badge.label} />;
              },
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
