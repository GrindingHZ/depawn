import { ApiError, recordAppraisal } from '@depawn/contracts';
import { Button, Card, Field, Money, toMinorUnits } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { intakeKeys } from '../intake-keys';
import type { IntakeStepProps } from './identify-step';

function messageFor(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INTAKE_ALREADY_SEALED') {
    return 'The intake is sealed and cannot take another appraisal.';
  }
  return 'The appraisal could not be recorded.';
}

export function AppraiseStep({ intake, onAdvance }: IntakeStepProps): ReactElement {
  const queryClient = useQueryClient();
  const [valueInput, setValueInput] = useState('');
  const [method, setMethod] = useState('');
  const [comparableReferences, setComparableReferences] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const appraiseMutation = useMutation({
    mutationFn: (minorUnits: string) =>
      recordAppraisal(
        intake.id,
        { value: { minorUnits, currency: 'AUD' }, method, comparableReferences },
        { idempotencyKey },
      ),
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      setValueInput('');
      await queryClient.invalidateQueries({ queryKey: intakeKeys.detail(intake.id) });
    },
  });

  return (
    <Card title="Appraise">
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const minorUnits = toMinorUnits(valueInput);
          if (minorUnits === null) {
            setInputError('Enter a value like 5000 or 5000.00.');
            return;
          }
          setInputError(null);
          appraiseMutation.mutate(minorUnits);
        }}
      >
        <Field
          label="Appraised value (AUD)"
          data-testid="appraise-value"
          value={valueInput}
          onChange={(event) => setValueInput(event.target.value)}
          errorMessage={inputError ?? undefined}
        />
        <Field
          label="Method"
          data-testid="appraise-method"
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          required
        />
        <Field
          label="Comparable references"
          data-testid="appraise-comparables"
          value={comparableReferences}
          onChange={(event) => setComparableReferences(event.target.value)}
        />
        <Button data-testid="appraise-save" type="submit" disabled={appraiseMutation.isPending}>
          Record appraisal
        </Button>
        {appraiseMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageFor(appraiseMutation.error)}
          </p>
        ) : null}
      </form>
      <ul data-testid="appraisal-list" className="mt-4 flex flex-col gap-1">
        {intake.appraisals.map((appraisal) => (
          <li key={appraisal.id} className="font-body text-sm text-ink-primary">
            <Money value={appraisal.value} /> by {appraisal.appraiserId.slice(0, 8)} (
            {appraisal.method})
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <Button
          data-testid="appraise-continue"
          variant="secondary"
          onClick={onAdvance}
          disabled={intake.appraisals.length === 0}
        >
          Continue
        </Button>
      </div>
    </Card>
  );
}
