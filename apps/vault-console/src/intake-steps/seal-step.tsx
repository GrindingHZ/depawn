import { ApiError, patchIntake, sealIntake } from '@depawn/contracts';
import { Button, Card, Dialog, Field } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { intakeKeys } from '../intake-keys';
import type { IntakeStepProps } from './identify-step';

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'INTAKE_INCOMPLETE') {
      return error.message;
    }
    if (error.code === 'DUAL_APPRAISAL_REQUIRED') {
      return 'A second independent appraisal is required before sealing.';
    }
    if (error.code === 'INTAKE_ALREADY_SEALED') {
      return 'The intake is already sealed.';
    }
  }
  return 'The intake could not be sealed.';
}

export function SealStep({ intake, onAdvance }: IntakeStepProps): ReactElement {
  const queryClient = useQueryClient();
  const [sealNumber, setSealNumber] = useState(intake.sealNumber ?? '');
  const [isConfirmOpen, setConfirmOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const sealMutation = useMutation({
    mutationFn: async () => {
      if (sealNumber !== (intake.sealNumber ?? '')) {
        await patchIntake(intake.id, { sealNumber }, { idempotencyKey: crypto.randomUUID() });
      }
      return sealIntake(intake.id, { idempotencyKey });
    },
    onSuccess: async () => {
      setIdempotencyKey(crypto.randomUUID());
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: intakeKeys.detail(intake.id) });
      onAdvance();
    },
    onError: () => {
      setConfirmOpen(false);
    },
  });

  if (intake.status === 'SEALED') {
    return (
      <Card title="Seal the record">
        <p className="font-body text-sm text-ink-primary">
          Sealed with hash <span className="font-mono text-xs">{intake.sealedHash}</span>
        </p>
        <div className="mt-4">
          <Button data-testid="seal-continue" onClick={onAdvance}>
            Continue
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card title="Seal the record">
      <div className="flex flex-col gap-4">
        <Field
          label="Physical seal number"
          data-testid="seal-number"
          value={sealNumber}
          onChange={(event) => setSealNumber(event.target.value)}
        />
        <Button data-testid="seal-request" onClick={() => setConfirmOpen(true)}>
          Seal the intake
        </Button>
        {sealMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            {messageFor(sealMutation.error)}
          </p>
        ) : null}
      </div>
      <Dialog title="Confirm sealing" isOpen={isConfirmOpen} onClose={() => setConfirmOpen(false)}>
        <p className="font-body text-sm text-ink-secondary">
          Sealing locks the record and its evidence forever. Nothing can change afterwards.
        </p>
        <div className="mt-4">
          <Button
            data-testid="seal-confirm"
            onClick={() => sealMutation.mutate()}
            disabled={sealMutation.isPending}
          >
            Seal now
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}
