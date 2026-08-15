import { ApiError, claimReceipt, markLoanDefaulted } from '@depawn/contracts';
import type { LoanResponse } from '@depawn/contracts';
import { Button, Card } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from './market-keys';

function actionMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'GRACE_PERIOD_ACTIVE') {
      return 'The borrower is still inside the grace period.';
    }
    if (error.code === 'LOAN_NOT_ACTIVE') {
      return 'This loan is no longer active.';
    }
    if (error.code === 'LOAN_NOT_DEFAULTED') {
      return 'Mark the loan defaulted before claiming the item.';
    }
    if (error.code === 'RECEIPT_NOT_ENCUMBERED') {
      return 'The item has already been claimed.';
    }
  }
  return 'The step could not be recorded.';
}

/* A lender acts on dates, so the card states them rather than only
   enabling or disabling a button they cannot explain. */
export function DefaultActionsCard({
  loan,
  nowMilliseconds,
}: {
  readonly loan: LoanResponse;
  readonly nowMilliseconds: number;
}): ReactElement {
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [defaultKey, setDefaultKey] = useState(() => crypto.randomUUID());
  const [claimKey, setClaimKey] = useState(() => crypto.randomUUID());

  const refreshLoans = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: marketKeys.myLoans('lender') });
    await queryClient.invalidateQueries({ queryKey: marketKeys.myReceipts });
  };

  const defaultMutation = useMutation({
    mutationFn: () => markLoanDefaulted(loan.id, { idempotencyKey: defaultKey }),
    onSuccess: async () => {
      setDefaultKey(crypto.randomUUID());
      setActionError(null);
      await refreshLoans();
    },
    onError: (error) => setActionError(actionMessageFor(error)),
  });

  const claimMutation = useMutation({
    mutationFn: () => claimReceipt(loan.id, { idempotencyKey: claimKey }),
    onSuccess: async () => {
      setClaimKey(crypto.randomUUID());
      setActionError(null);
      await refreshLoans();
    },
    onError: (error) => setActionError(actionMessageFor(error)),
  });

  const graceHasPassed = Date.parse(loan.graceEndsAt) < nowMilliseconds;
  return (
    <Card title="If the borrower does not repay">
      <div data-testid={`default-actions-${loan.id}`} className="flex flex-col gap-3">
        <p className="font-body text-sm text-ink-secondary">
          {loan.status === 'DEFAULTED'
            ? 'This loan is in default. Claiming moves the item into your name at the vault, where you can redeem it.'
            : `Grace runs until ${loan.graceEndsAt.slice(0, 10)}. Until then the borrower can still repay.`}
        </p>
        <div className="flex gap-2">
          <Button
            data-testid={`mark-default-${loan.id}`}
            onClick={() => defaultMutation.mutate()}
            disabled={loan.status !== 'ACTIVE' || !graceHasPassed || defaultMutation.isPending}
          >
            Mark defaulted
          </Button>
          <Button
            variant="secondary"
            data-testid={`claim-receipt-${loan.id}`}
            onClick={() => claimMutation.mutate()}
            disabled={loan.status !== 'DEFAULTED' || claimMutation.isPending}
          >
            Claim the item
          </Button>
        </div>
        {actionError === null ? null : (
          <p role="alert" className="font-body text-sm text-status-danger">
            {actionError}
          </p>
        )}
      </div>
    </Card>
  );
}
