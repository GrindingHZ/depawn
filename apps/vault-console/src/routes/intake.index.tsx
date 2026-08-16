import { ApiError, beginIntake, messageForError } from '@depawn/contracts';
import { Button, Card, Field } from '@depawn/ui';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/intake/')({
  component: IntakeStartPage,
});

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'NOT_FOUND') {
    return 'No account exists for this email.';
  }
  return messageForError(error, 'The request failed. Try again.');
}

function IntakeStartPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <div className="max-w-md">
          <StartIntakeCard />
        </div>
      </ConsoleShell>
    </StaffGuard>
  );
}

function StartIntakeCard(): ReactElement {
  const navigate = useNavigate();
  const [borrowerEmail, setBorrowerEmail] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const beginMutation = useMutation({
    mutationFn: () =>
      beginIntake(
        demoVaultId,
        { borrowerEmail, itemCategory: 'BULLION', itemDescription },
        { idempotencyKey },
      ),
    onSuccess: async (intake) => {
      setIdempotencyKey(crypto.randomUUID());
      await navigate({ to: '/intake/$intakeId', params: { intakeId: intake.id } });
    },
  });

  return (
    <Card title="Start a new intake">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          beginMutation.mutate();
        }}
      >
        <Field
          label="Borrower email"
          type="email"
          data-testid="intake-borrower-email"
          value={borrowerEmail}
          onChange={(event) => setBorrowerEmail(event.target.value)}
          required
        />
        <Field
          label="Item description"
          data-testid="intake-item-description"
          value={itemDescription}
          onChange={(event) => setItemDescription(event.target.value)}
          required
        />
        <p className="font-body text-sm text-ink-secondary">Category: bullion</p>
        <Button data-testid="intake-start" type="submit" disabled={beginMutation.isPending}>
          Begin intake
        </Button>
        {beginMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageFor(beginMutation.error)}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
