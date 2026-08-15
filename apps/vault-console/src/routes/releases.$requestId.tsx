import {
  ApiError,
  confirmRelease,
  fetchRedemptionQueue,
  verifyRedemption,
} from '@depawn/contracts';
import type { RedemptionRequestResponse } from '@depawn/contracts';
import { Button, Card, Field, Skeleton, StatusBadge } from '@depawn/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { redemptionKeys } from '../redemption-keys';
import { redemptionStatusTone } from '../redemption-status-tone';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/releases/$requestId')({
  component: ReleaseDetailPage,
});

function ReleaseDetailPage(): ReactElement {
  const { requestId } = Route.useParams();
  return (
    <StaffGuard>
      <ConsoleShell>
        <ReleaseDetail requestId={requestId} />
      </ConsoleShell>
    </StaffGuard>
  );
}

function counterMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'REDEMPTION_NOT_VERIFIED') {
      return 'Verify the customer identity before handing the item over.';
    }
    if (error.code === 'REDEMPTION_ALREADY_RELEASED') {
      return 'This item has already been handed over.';
    }
  }
  return 'The step could not be recorded.';
}

function ReleaseDetail({ requestId }: { readonly requestId: string }): ReactElement {
  const queueQuery = useQuery({
    queryKey: redemptionKeys.queue,
    queryFn: () => fetchRedemptionQueue(demoVaultId),
  });

  if (queueQuery.isPending) {
    return (
      <Card title="Release">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (queueQuery.isError || queueQuery.data === undefined) {
    return (
      <Card title="Release">
        <p role="alert" className="font-body text-sm text-status-danger">
          The request could not be loaded.
        </p>
      </Card>
    );
  }

  const request = queueQuery.data.items.find((item) => item.id === requestId);
  if (request === undefined) {
    return (
      <Card title="Release">
        <p className="font-body text-sm text-ink-secondary">
          This request is no longer in the queue. The item has left the vault.
        </p>
      </Card>
    );
  }
  return <ReleaseSteps request={request} />;
}

function ReleaseSteps({ request }: { readonly request: RedemptionRequestResponse }): ReactElement {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sealNumber, setSealNumber] = useState('');
  const [sealError, setSealError] = useState<string | null>(null);
  const [verifyKey, setVerifyKey] = useState(() => crypto.randomUUID());
  const [releaseKey, setReleaseKey] = useState(() => crypto.randomUUID());

  const verifyMutation = useMutation({
    mutationFn: () => verifyRedemption(request.id, { idempotencyKey: verifyKey }),
    onSuccess: async () => {
      setVerifyKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: redemptionKeys.queue });
    },
  });

  const releaseMutation = useMutation({
    mutationFn: (sealNumberBroken: string) =>
      confirmRelease(request.id, { sealNumberBroken }, { idempotencyKey: releaseKey }),
    onSuccess: async () => {
      setReleaseKey(crypto.randomUUID());
      await queryClient.invalidateQueries({ queryKey: redemptionKeys.queue });
      await navigate({ to: '/releases' });
    },
  });

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card title="Request">
        <dl className="flex flex-wrap gap-8">
          <div>
            <dt className="font-body text-sm text-ink-secondary">Receipt</dt>
            <dd className="font-mono text-xs">{request.receiptId}</dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Requested</dt>
            <dd>{request.requestedAt.slice(0, 10)}</dd>
          </div>
          <div>
            <dt className="font-body text-sm text-ink-secondary">Status</dt>
            <dd>
              <StatusBadge tone={redemptionStatusTone(request.status)} label={request.status} />
            </dd>
          </div>
        </dl>
      </Card>

      <Card title="Step one: verify identity">
        <p className="mb-3 font-body text-sm text-ink-secondary">
          Check photographic identity against the intake record. Recording this names you on the
          request permanently.
        </p>
        <Button
          data-testid="verify-identity"
          onClick={() => verifyMutation.mutate()}
          disabled={request.status !== 'REQUESTED' || verifyMutation.isPending}
        >
          Identity verified
        </Button>
        {verifyMutation.isError ? (
          <p role="alert" className="mt-2 font-body text-sm text-status-danger">
            {counterMessageFor(verifyMutation.error)}
          </p>
        ) : null}
      </Card>

      <Card title="Step two: hand the item over">
        <p className="mb-3 font-body text-sm text-ink-secondary">
          Break the seal in front of the customer and record its number. This step cannot be undone.
        </p>
        <form
          className="flex items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (sealNumber.trim() === '') {
              setSealError('Record the seal number you broke.');
              return;
            }
            setSealError(null);
            releaseMutation.mutate(sealNumber.trim());
          }}
        >
          <Field
            label="Seal number broken"
            data-testid="seal-number-broken"
            value={sealNumber}
            onChange={(event) => setSealNumber(event.target.value)}
            errorMessage={sealError ?? undefined}
          />
          <Button
            data-testid="confirm-release"
            type="submit"
            disabled={request.status !== 'VERIFIED' || releaseMutation.isPending}
          >
            Item handed over
          </Button>
        </form>
        {releaseMutation.isError ? (
          <p role="alert" className="mt-2 font-body text-sm text-status-danger">
            {counterMessageFor(releaseMutation.error)}
          </p>
        ) : null}
      </Card>
    </div>
  );
}
