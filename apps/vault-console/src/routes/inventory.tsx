import { fetchInventory, nameForReceiptStatus } from '@depawn/contracts';
import type { ReceiptResponse } from '@depawn/contracts';
import { Card, DataTable, Money, Select, Skeleton, StatusBadge } from '@depawn/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConsoleShell } from '../console-shell';
import { intakeKeys } from '../intake-keys';
import { receiptStatusTone } from '../receipt-status-tone';
import { StaffGuard } from '../staff-guard';
import { demoVaultId } from '../vault-constants';

export const Route = createFileRoute('/inventory')({
  component: InventoryPage,
});

function InventoryPage(): ReactElement {
  return (
    <StaffGuard>
      <ConsoleShell>
        <InventoryCard />
      </ConsoleShell>
    </StaffGuard>
  );
}

function InventoryCard(): ReactElement {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const inventoryQuery = useQuery({
    queryKey: intakeKeys.inventory(statusFilter),
    queryFn: () => fetchInventory(demoVaultId, statusFilter === 'ALL' ? undefined : statusFilter),
  });

  return (
    <Card title="Inventory">
      <div className="mb-4 max-w-xs">
        <Select
          label="Status"
          data-testid="inventory-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
        >
          <option value="ALL">All</option>
          <option value="IN_VAULT">In vault</option>
          <option value="ENCUMBERED">Encumbered</option>
          <option value="RELEASED">Released</option>
          <option value="LIQUIDATED">Liquidated</option>
        </Select>
      </div>
      {inventoryQuery.isPending ? (
        <Skeleton lineCount={4} />
      ) : inventoryQuery.isError || inventoryQuery.data === undefined ? (
        <p role="alert" className="font-body text-sm text-status-danger">
          The inventory could not be loaded.
        </p>
      ) : (
        <div data-testid="inventory-table">
          <DataTable
            columns={[
              /* The id stays first and stays monospaced: staff quote these to
                 each other and read them off labels, so leading with a name
                 would be a lender's treatment applied to an operations tool.
                 The description sits under it, because finding a thing on a
                 shelf is easier when the screen says what the thing is. */
              {
                key: 'id',
                header: 'Receipt',
                render: (receipt: ReceiptResponse) => (
                  <span className="block">
                    <span className="block font-mono text-xs">{receipt.id}</span>
                    <span className="block font-body text-xs text-ink-secondary">
                      {receipt.itemDescription}
                    </span>
                  </span>
                ),
              },
              {
                key: 'value',
                header: 'Appraised value',
                render: (receipt: ReceiptResponse) => <Money value={receipt.appraisedValue} />,
              },
              {
                key: 'holder',
                header: 'Holder',
                render: (receipt: ReceiptResponse) => (
                  <span className="font-mono text-xs">{receipt.holderAccountId}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (receipt: ReceiptResponse) => (
                  <StatusBadge
                    tone={receiptStatusTone(receipt.status)}
                    label={nameForReceiptStatus(receipt.status)}
                  />
                ),
              },
            ]}
            rows={inventoryQuery.data.items}
            rowKey={(receipt) => receipt.id}
            emptyTitle="Nothing in the vault yet"
          />
        </div>
      )}
    </Card>
  );
}
