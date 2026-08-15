import { fetchMyLoans } from '@depawn/contracts';
import { Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { LoansTable } from '../loans-table';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';
import { PayoffCard } from '../payoff-card';

export const Route = createFileRoute('/borrow/loans')({
  component: BorrowLoansPage,
});

function BorrowLoansPage(): ReactElement | null {
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

  return (
    <MarketShell>
      <div className="flex max-w-4xl flex-col gap-6">
        <MyLoansCard />
      </div>
    </MarketShell>
  );
}

function MyLoansCard(): ReactElement {
  const loansQuery = useQuery({
    queryKey: marketKeys.myLoans('borrower'),
    queryFn: () => fetchMyLoans('borrower'),
  });
  const activeLoans = (loansQuery.data?.items ?? []).filter((loan) => loan.status === 'ACTIVE');

  return (
    <>
      <LoansTable
        title="My loans"
        testId="my-loans"
        emptyTitle="You have no loans yet"
        query={loansQuery}
        footnote="Repaying a loan returns the item to the vault under your name."
      />
      {activeLoans.map((loan) => (
        <PayoffCard key={loan.id} loan={loan} />
      ))}
    </>
  );
}
