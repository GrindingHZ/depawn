import { fetchMyLoans } from '@depawn/contracts';
import { Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Navigate, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useCurrentAccount } from '../current-account';
import { LoansTable } from '../loans-table';
import { marketKeys } from '../market-keys';
import { MarketShell } from '../market-shell';

export const Route = createFileRoute('/lend/loans')({
  component: LendLoansPage,
});

function LendLoansPage(): ReactElement | null {
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
      <div className="max-w-4xl">
        <FundedLoansCard />
      </div>
    </MarketShell>
  );
}

function FundedLoansCard(): ReactElement {
  const loansQuery = useQuery({
    queryKey: marketKeys.myLoans('lender'),
    queryFn: () => fetchMyLoans('lender'),
  });

  return (
    <LoansTable
      title="Funded loans"
      testId="funded-loans"
      emptyTitle="You have funded no loans yet"
      query={loansQuery}
      footnote="Marking a default and claiming the receipt open in the default release."
    />
  );
}
