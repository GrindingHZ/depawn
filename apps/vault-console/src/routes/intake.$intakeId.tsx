import { fetchIntake } from '@depawn/contracts';
import { Card, Skeleton, Stepper } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { intakeKeys } from '../intake-keys';
import { AppraiseStep } from '../intake-steps/appraise-step';
import { IdentifyStep } from '../intake-steps/identify-step';
import { IssueStep } from '../intake-steps/issue-step';
import { PhotographStep } from '../intake-steps/photograph-step';
import { SealStep } from '../intake-steps/seal-step';
import { StaffGuard } from '../staff-guard';

export const Route = createFileRoute('/intake/$intakeId')({
  component: IntakeWizardPage,
});

const stepNames = ['Identify', 'Photograph', 'Appraise', 'Seal', 'Issue'] as const;

function IntakeWizardPage(): ReactElement {
  const { intakeId } = Route.useParams();
  return (
    <StaffGuard>
      <ConsoleShell>
        <IntakeWizard intakeId={intakeId} />
      </ConsoleShell>
    </StaffGuard>
  );
}

function IntakeWizard({ intakeId }: { readonly intakeId: string }): ReactElement {
  const intakeQuery = useQuery({
    queryKey: intakeKeys.detail(intakeId),
    queryFn: () => fetchIntake(intakeId),
  });
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  if (intakeQuery.isPending) {
    return <Skeleton lineCount={6} />;
  }
  if (intakeQuery.isError || intakeQuery.data === undefined) {
    return (
      <Card title="Intake">
        <p role="alert" className="font-body text-sm text-status-danger">
          The intake could not be loaded.
        </p>
      </Card>
    );
  }

  const intake = intakeQuery.data;
  // A reload resumes where the server state says the intake is; local step
  // state only tracks forward movement within that.
  const currentIndex = stepIndex ?? (intake.status === 'SEALED' ? 4 : 0);
  const advance = (): void => setStepIndex(Math.min(currentIndex + 1, stepNames.length - 1));
  const goBack = (): void => setStepIndex(Math.max(currentIndex - 1, 0));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Stepper steps={[...stepNames]} currentIndex={currentIndex} />
      {currentIndex === 0 ? <IdentifyStep intake={intake} onAdvance={advance} /> : null}
      {currentIndex === 1 ? <PhotographStep intake={intake} onAdvance={advance} /> : null}
      {currentIndex === 2 ? <AppraiseStep intake={intake} onAdvance={advance} /> : null}
      {currentIndex === 3 ? <SealStep intake={intake} onAdvance={advance} /> : null}
      {currentIndex === 4 ? <IssueStep intake={intake} /> : null}
      {currentIndex > 0 && intake.status === 'DRAFT' ? (
        <button
          type="button"
          onClick={goBack}
          className="cursor-pointer self-start font-body text-sm text-ink-secondary"
        >
          Back
        </button>
      ) : null}
    </div>
  );
}
