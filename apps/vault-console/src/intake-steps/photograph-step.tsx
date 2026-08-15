import { uploadIntakePhoto } from '@depawn/contracts';
import { Button, Card } from '@depawn/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import type { ReactElement } from 'react';
import { intakeKeys } from '../intake-keys';
import type { IntakeStepProps } from './identify-step';

export function PhotographStep({ intake, onAdvance }: IntakeStepProps): ReactElement {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadIntakePhoto(intake.id, file, {}),
    onSuccess: async () => {
      if (fileInput.current !== null) {
        fileInput.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: intakeKeys.detail(intake.id) });
    },
  });

  return (
    <Card title="Photograph and evidence">
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 font-body text-sm text-ink-secondary">
          Add a photo
          <input
            ref={fileInput}
            data-testid="photo-input"
            type="file"
            accept="image/*"
            className="font-body text-sm text-ink-primary"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file !== undefined) {
                uploadMutation.mutate(file);
              }
            }}
          />
        </label>
        {uploadMutation.isError ? (
          <p role="alert" className="font-body text-sm text-status-danger">
            The photo could not be uploaded.
          </p>
        ) : null}
        <ul data-testid="evidence-list" className="flex flex-col gap-1">
          {intake.evidence.map((item) => (
            <li key={item.contentHash} className="font-body text-sm text-ink-primary">
              {item.label}{' '}
              <span className="font-mono text-xs text-ink-secondary">
                {item.contentHash.slice(0, 12)}
              </span>
            </li>
          ))}
        </ul>
        <Button
          data-testid="photograph-continue"
          onClick={onAdvance}
          disabled={intake.evidence.length === 0}
        >
          Continue
        </Button>
      </div>
    </Card>
  );
}
