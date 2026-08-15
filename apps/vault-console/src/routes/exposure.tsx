import { fetchVaultExposure } from '@depawn/contracts';
import { Card, Money, Skeleton } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { intakeKeys } from '../intake-keys';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/exposure')({
  component: ExposurePage,
});

function ExposurePage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <div className="max-w-md">
          <ExposureCard />
        </div>
      </ConsoleShell>
    </StaffGuard>
  );
}

function ExposureCard(): ReactElement {
  const exposureQuery = useQuery({
    queryKey: intakeKeys.exposure,
    queryFn: () => fetchVaultExposure(demoVaultId),
  });

  if (exposureQuery.isPending) {
    return (
      <Card title="Insured exposure">
        <Skeleton lineCount={3} />
      </Card>
    );
  }
  if (exposureQuery.isError || exposureQuery.data === undefined) {
    return (
      <Card title="Insured exposure">
        <p role="alert" className="font-body text-sm text-status-danger">
          The exposure could not be loaded.
        </p>
      </Card>
    );
  }

  const exposure = exposureQuery.data;
  const limit = BigInt(exposure.insuredLimit.minorUnits);
  const used = BigInt(exposure.exposure.minorUnits);
  const isNearLimit = limit > 0n && used * 5n >= limit * 4n;

  return (
    <Card title="Insured exposure">
      <dl className="flex flex-col gap-3">
        <div>
          <dt className="font-body text-sm text-ink-secondary">Insured limit</dt>
          <dd className="text-lg">
            <Money value={exposure.insuredLimit} />
          </dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Current exposure</dt>
          <dd data-testid="exposure-current" className="text-lg">
            <Money value={exposure.exposure} />
          </dd>
        </div>
        <div>
          <dt className="font-body text-sm text-ink-secondary">Remaining</dt>
          <dd
            data-testid="exposure-remaining"
            className={isNearLimit ? 'text-lg text-status-warning' : 'text-lg'}
          >
            <Money value={exposure.remaining} />
            {isNearLimit ? (
              <span className="ml-2 font-body text-sm text-status-warning">
                Above four fifths of the insured limit
              </span>
            ) : null}
          </dd>
        </div>
      </dl>
    </Card>
  );
}
