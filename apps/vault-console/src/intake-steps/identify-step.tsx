import { patchIntake } from '@depawn/contracts';
import type { IntakeResponse } from '@depawn/contracts';
import { Button, Card, Field } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { intakeKeys } from '../intake-keys';

export interface IntakeStepProps {
  readonly intake: IntakeResponse;
  readonly onAdvance: () => void;
}

export function IdentifyStep({ intake, onAdvance }: IntakeStepProps): ReactElement {
  const queryClient = useQueryClient();
  const [itemDescription, setItemDescription] = useState(intake.itemDescription);
  const [serialNumbersInput, setSerialNumbersInput] = useState(intake.serialNumbers.join(', '));
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const saveMutation = useMutation({
    mutationFn: () =>
      patchIntake(
        intake.id,
        {
          itemDescription,
          serialNumbers: serialNumbersInput
            .split(',')
            .map((value) => value.trim())
            .filter((value) => value !== ''),
        },
        { idempotencyKey },
      ),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: intakeKeys.detail(intake.id) });
      onAdvance();
    },
  });

  return (
    <Card title="Identify the item">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <Field
          label="Item description"
          data-testid="identify-description"
          value={itemDescription}
          onChange={(event) => setItemDescription(event.target.value)}
          required
        />
        <Field
          label="Serial numbers (comma separated)"
          data-testid="identify-serials"
          value={serialNumbersInput}
          onChange={(event) => setSerialNumbersInput(event.target.value)}
        />
        <Button data-testid="identify-save" type="submit" disabled={saveMutation.isPending}>
          Save and continue
        </Button>
        {saveMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The intake could not be updated.
          </p>
        ) : null}
      </form>
    </Card>
  );
}
