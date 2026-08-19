import { ApiError, messageForError, placeOffer } from '@depawn/contracts';
import type { ListingDetailResponse } from '@depawn/contracts';
import { Button, Field, toMinorUnits } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { marketKeys } from '../market-keys';
import { walletKeys } from '../wallet-keys';

function offerMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'LOAN_TO_VALUE_EXCEEDED') {
      return 'The principal is above the lending ceiling for this item.';
    }
    if (error.code === 'RATE_ABOVE_MAXIMUM') {
      return 'The rate is above the maximum for this listing.';
    }
    if (error.code === 'INSUFFICIENT_FUNDS') {
      return 'Your available balance does not cover this principal.';
    }
    if (error.code === 'SYSTEM_PAUSED') {
      return 'Trading is paused. Repayments and redemptions are unaffected.';
    }
  }
  return messageForError(error, 'The offer could not be placed.');
}

export function PlaceOfferForm({
  detail,
}: {
  readonly detail: ListingDetailResponse;
}): ReactElement {
  const queryClient = useQueryClient();
  const [principalInput, setPrincipalInput] = useState(
    (BigInt(detail.requestedPrincipal.minorUnits) / 100n).toString(),
  );
  const [rateInput, setRateInput] = useState('18.00');
  const [inputError, setInputError] = useState<string | null>(null);
  // Generated on mount and rotated per success (docs/05-frontend.md).
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const principalMinorUnits = toMinorUnits(principalInput);
  const isAboveCeiling =
    principalMinorUnits !== null &&
    BigInt(principalMinorUnits) > BigInt(detail.maxPrincipal.minorUnits);

  const offerMutation = useMutation({
    mutationFn: (input: { minorUnits: string; rateBasisPoints: number }) =>
      placeOffer(
        detail.id,
        {
          principal: { minorUnits: input.minorUnits, currency: 'AUD' },
          annualPercentageRateBasisPoints: input.rateBasisPoints,
          durationMs: detail.requestedDurationMs,
          expiresAt: detail.expiresAt,
        },
        { idempotencyKey },
      ),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: marketKeys.detail(detail.id) });
      await queryClient.invalidateQueries({ queryKey: marketKeys.myOffers });
      await queryClient.invalidateQueries({ queryKey: walletKeys.all });
    },
  });

  return (
    <div className="p-3">
      <h3 className="mb-3 font-mono text-xs uppercase tracking-wide text-ink-secondary">
        Place an offer
      </h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (principalMinorUnits === null) {
            setInputError('Enter a principal like 2500 or 2500.00.');
            return;
          }
          const rateBasisPoints = toMinorUnits(rateInput);
          if (rateBasisPoints === null) {
            setInputError('Enter a rate like 18.00.');
            return;
          }
          setInputError(null);
          offerMutation.mutate({
            minorUnits: principalMinorUnits,
            rateBasisPoints: Number(rateBasisPoints),
          });
        }}
      >
        <Field
          label="Principal (AUD)"
          data-testid="offer-principal"
          value={principalInput}
          onChange={(event) => setPrincipalInput(event.target.value)}
          errorMessage={
            inputError ?? (isAboveCeiling ? 'Above the lending ceiling for this item.' : undefined)
          }
        />
        <Field
          label="Annual rate (% per year)"
          data-testid="offer-rate"
          value={rateInput}
          onChange={(event) => setRateInput(event.target.value)}
        />
        <Button
          data-testid="offer-submit"
          type="submit"
          disabled={offerMutation.isPending || isAboveCeiling}
        >
          Place funded offer
        </Button>
        {offerMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {offerMessageFor(offerMutation.error)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
