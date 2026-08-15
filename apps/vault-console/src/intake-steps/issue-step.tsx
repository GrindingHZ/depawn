import { ApiError, issueReceipt } from '@depawn/contracts';
import type { ReceiptResponse } from '@depawn/contracts';
import { Button, Card, Dialog, Field } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { intakeKeys } from '../intake-keys';
import type { IntakeStepProps } from './identify-step';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INTAKE_NOT_SEALED') {
      return 'Seal the intake before issuing the receipt.';
    }
    if (error.code === 'VAULT_INSURED_LIMIT_EXCEEDED') {
      return 'Issuing this receipt would push the vault past its insured limit.';
    }
  }
  return 'The receipt could not be issued.';
}

export function IssueStep({ intake }: Omit<IntakeStepProps, 'onAdvance'>): ReactElement {
  const queryClient = useQueryClient();
  const [insurancePolicyReference, setInsurancePolicyReference] = useState('');
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptResponse | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const issueMutation = useMutation({
    mutationFn: () => issueReceipt(intake.id, { insurancePolicyReference }, { idempotencyKey }),
    onSuccess: async (issued) => {
      setIdempotencyKey(crypto.randomUUID());
      setConfirmOpen(false);
      setReceipt(issued);
      await queryClient.invalidateQueries({ queryKey: intakeKeys.all });
      await queryClient.invalidateQueries({ queryKey: intakeKeys.exposure });
    },
    onError: () => {
      setConfirmOpen(false);
    },
  });

  if (receipt !== null) {
    return (
      <Card title="Receipt issued">
        <p className="font-body text-sm text-ink-primary">
          Receipt{' '}
          <span data-testid="issued-receipt-id" className="font-mono">
            {receipt.id}
          </span>{' '}
          now belongs to the borrower.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Review and issue">
      <div className="flex flex-col gap-4">
        <p className="font-body text-sm text-ink-secondary">
          Sealed hash <span className="font-mono text-xs">{intake.sealedHash}</span>
        </p>
        <Field
          label="Insurance policy reference"
          data-testid="issue-policy"
          value={insurancePolicyReference}
          onChange={(event) => setInsurancePolicyReference(event.target.value)}
        />
        <Button
          data-testid="issue-request"
          onClick={() => setConfirmOpen(true)}
          disabled={insurancePolicyReference === ''}
        >
          Issue the receipt
        </Button>
        {issueMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageFor(issueMutation.error)}
          </p>
        ) : null}
      </div>
      <Dialog title="Confirm issuing" isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="font-body text-sm text-ink-secondary">
          Issuing creates the transferable claim on this item and hands it to the borrower. This
          cannot be undone.
        </p>
        <div className="mt-4">
          <Button
            data-testid="issue-confirm"
            onClick={() => issueMutation.mutate()}
            disabled={issueMutation.isPending}
          >
            Issue now
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
