import { ApiError, fetchPayoffQuote, repayLoan } from '@depawn/contracts';
import type { LoanResponse, MoneyDto } from '@depawn/contracts';
import { Button, Card, Money, Skeleton } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from './market-keys';
import { walletKeys } from './wallet-keys';

function secondsUntil(validUntil: string, nowMilliseconds: number): number {
  return Math.max(0, Math.ceil((Date.parse(validUntil) - nowMilliseconds) / 1000));
}

function isMoneyDto(value: unknown): value is MoneyDto {
  const candidate: { minorUnits?: unknown; currency?: unknown } = value ?? {};
  return typeof candidate.minorUnits === 'string' && typeof candidate.currency === 'string';
}

/* A stale quote and a short payment both come back with the figure now owed,
   and the borrower must see that figure rather than have the app retry with
   a number they never agreed to (docs/05-frontend.md). */
function amountDueFrom(error: unknown): MoneyDto | null {
  if (!(error instanceof ApiError)) {
    return null;
  }
  const details: { amountDue?: unknown } = error.details ?? {};
  return isMoneyDto(details.amountDue) ? details.amountDue : null;
}

function repayMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'PAYOFF_QUOTE_STALE') {
      return 'Interest moved while you were reading. The amount below is current.';
    }
    if (error.code === 'REPAYMENT_AMOUNT_INSUFFICIENT') {
      return 'That payment no longer covers the loan. The amount below is current.';
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Your available balance does not cover the payoff.';
    }
    if (error.code === 'LOAN_NOT_ACTIVE') {
      return 'This loan is already closed.';
    }
  }
  return 'The repayment could not be completed.';
}

export function PayoffCard({ loan }: { readonly loan: LoanResponse }): ReactElement {
  const queryClient = useQueryClient();
  const [nowMilliseconds, setNowMilliseconds] = useState(() => Date.now());
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const quoteQuery = useQuery({
    queryKey: marketKeys.payoffQuote(loan.id),
    queryFn: () => fetchPayoffQuote(loan.id),
  });

  const quote = quoteQuery.data;
  const remainingSeconds =
    quote === undefined ? 0 : secondsUntil(quote.validUntil, nowMilliseconds);

  // The countdown ticks so the borrower can see the quote ageing, and the
  // refetch happens the moment it expires rather than on the next click.
  useEffect(() => {
    const timer = window.setInterval(() => setNowMilliseconds(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (quote !== undefined && remainingSeconds === 0) {
      void quoteQuery.refetch();
    }
  }, [quote, remainingSeconds, quoteQuery]);

  const repayMutation = useMutation({
    mutationFn: () => {
      if (quote === undefined) {
        return Promise.reject(new Error('A quote is required before repaying.'));
      }
      // The repayment schema is single currency by design, so the amount is
      // restated against that literal rather than passed through loosely.
      return repayLoan(
        loan.id,
        {
          amount: { minorUnits: quote.total.minorUnits, currency: 'AUD' },
          quotedAt: quote.quotedAt,
        },
        { idempotencyKey },
      );
    },
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('borrower') });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
    onError: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await quoteQuery.refetch();
    },
  });

  if (quoteQuery.isPending) {
    return (
      <Card title="Payoff">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (quoteQuery.isError || quote === undefined) {
    return (
      <Card title="Payoff">
        <p role="alert" className="font-body text-sm text-status-danger">
          The payoff figure could not be loaded.
        </p>
      </Card>
    );
  }

  const rejectedAmountDue = amountDueFrom(repayMutation.error);
  return (
    <Card title="Payoff">
      <div data-testid={`payoff-${loan.id}`} className="flex flex-col gap-4">
        <dl className="flex flex-wrap gap-8">
          <div>
            <dt className="font-body text-sm text-ink-secondary">Principal</dt>
            <dd>
              <Money value={quote.principal} />
            </dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Interest so far</dt>
            <dd data-testid="payoff-interest">
              <Money value={quote.accruedInterest} />
            </dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Total to repay</dt>
            <dd data-testid="payoff-total" className="text-lg">
              <Money value={rejectedAmountDue ?? quote.total} />
            </dd>
          </div>
        </dl>
        <p className="font-body text-sm text-ink-secondary" data-testid="payoff-countdown">
          {remainingSeconds === 0
            ? 'Refreshing the figure.'
            : `This figure holds for ${remainingSeconds} seconds.`}
        </p>
        <div>
          <Button
            data-testid={`repay-${loan.id}`}
            onClick={() => repayMutation.mutate()}
            disabled={repayMutation.isPending || quoteQuery.isFetching}
          >
            Repay and release the item
          </Button>
        </div>
        {repayMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {repayMessageFor(repayMutation.error)}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
