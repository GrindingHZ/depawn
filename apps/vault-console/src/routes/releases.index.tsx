import { fetchRedemptionQueue } from '@depawn/contracts';
import type { RedemptionRequestResponse } from '@depawn/contracts';
import { Card, DataTable, Skeleton, StatusBadge } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { redemptionKeys } from '../redemption-keys';
import { redemptionStatusTone } from '../redemption-status-tone';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/releases/')({
  component: ReleasesPage,
});

function ReleasesPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <ReleaseQueueCard />
      </ConsoleShell>
    </StaffGuard>
  );
}

function ReleaseQueueCard(): ReactElement {
  const queueQuery = useQuery({
    queryKey: redemptionKeys.queue,
    queryFn: () => fetchRedemptionQueue(demoVaultId),
  });

  if (queueQuery.isPending) {
    return (
      <Card title="Releases">
        <Skeleton lineCount={4} />
      </Card>
    );
  }
  if (queueQuery.isError || queueQuery.data === undefined) {
    return (
      <Card title="Releases">
        <p role="alert" className="font-body text-sm text-status-danger">
          The release queue could not be loaded.
        </p>
      </Card>
    );
  }

  return (
    <Card title="Releases">
      <div data-testid="release-queue">
        <DataTable
          columns={[
            {
              key: 'request',
              header: 'Request',
              render: (item: RedemptionRequestResponse) => (
                <Link
                  to="/releases/$requestId"
                  params={{ requestId: item.id }}
                  className="font-mono text-xs text-status-active"
                >
                  {item.id}
                </Link>
              ),
            },
            {
              key: 'receipt',
              header: 'Receipt',
              render: (item: RedemptionRequestResponse) => (
                <span className="font-mono text-xs">{item.receiptId}</span>
              ),
            },
            {
              key: 'requested',
              header: 'Requested',
              render: (item: RedemptionRequestResponse) => item.requestedAt.slice(0, 10),
            },
            {
              key: 'status',
              header: 'Status',
              render: (item: RedemptionRequestResponse) => (
                <StatusBadge tone={redemptionStatusTone(item.status)} label={item.status} />
              ),
            },
          ]}
          rows={queueQuery.data.items}
          rowKey={(item) => item.id}
          emptyTitle="Nobody is waiting at the counter"
        />
      </div>
    </Card>
  );
}
