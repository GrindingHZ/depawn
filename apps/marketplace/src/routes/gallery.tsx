import {
  AppShell,
  Button,
  Card,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  Money,
  Rate,
  Select,
  Skeleton,
  StatusBadge,
  Stepper,
  ToastRegion,
} from '@depawn/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import type { ReactElement } from 'react';

export const Route = createFileRoute('/gallery')({
  component: GalleryPage,
});

interface GalleryRow {
  readonly id: string;
  readonly principal: string;
  readonly status: string;
}

const galleryRows: GalleryRow[] = [
  { id: '01LOAN', principal: '250000', status: 'Active' },
  { id: '02LOAN', principal: '990000', status: 'Repaid' },
];

/* Static exhibit of every primitive against the frozen tokens. Reviewed by
   eye, exercised by unit tests in packages/ui. */
function GalleryPage(): ReactElement {
  const [isDialogOpen, setDialogOpen] = useState(false);

  return (
    <AppShell productName="depawn gallery" navigation={<span>Primitive gallery</span>}>
      <div className="flex max-w-3xl flex-col gap-6">
        <Card title="Buttons">
          <div className="flex gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>

        <Card title="Form controls">
          <div className="flex flex-col gap-4">
            <Field label="Email" type="email" />
            <Field label="With an error" errorMessage="Enter a valid email address." />
            <Select label="Item category" defaultValue="BULLION">
              <option value="BULLION">Bullion</option>
            </Select>
            <Checkbox label="Requires dual appraisal" />
          </div>
        </Card>

        <Card title="Money and rates">
          <p>
            <Money value={{ minorUnits: '250000', currency: 'AUD' }} /> at{' '}
            <Rate basisPoints={1800} />
          </p>
        </Card>

        <Card title="Status badges">
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="neutral" label="Draft" />
            <StatusBadge tone="active" label="Active" />
            <StatusBadge tone="success" label="Repaid" />
            <StatusBadge tone="warning" label="In grace" />
            <StatusBadge tone="danger" label="Defaulted" />
          </div>
        </Card>

        <Card title="Data table">
          <DataTable
            columns={[
              { key: 'id', header: 'Loan', render: (row: GalleryRow) => row.id },
              {
                key: 'principal',
                header: 'Principal',
                render: (row: GalleryRow) => (
                  <Money value={{ minorUnits: row.principal, currency: 'AUD' }} />
                ),
              },
              { key: 'status', header: 'Status', render: (row: GalleryRow) => row.status },
            ]}
            rows={galleryRows}
            rowKey={(row) => row.id}
            emptyTitle="No rows"
          />
        </Card>

        <Card title="Stepper">
          <Stepper
            steps={['Identify', 'Photograph', 'Appraise', 'Seal', 'Issue']}
            currentIndex={2}
          />
        </Card>

        <Card title="Loading and empty">
          <div className="flex flex-col gap-4">
            <Skeleton lineCount={3} />
            <EmptyState title="No listings yet" description="List a receipt to request a loan." />
          </div>
        </Card>

        <Card title="Dialog">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Dialog title="Confirm seal" isOpen={isDialogOpen} onClose={() => setDialogOpen(false)}>
            <p className="font-body text-sm text-ink-secondary">
              Sealing locks the intake record. This cannot be undone.
            </p>
          </Dialog>
        </Card>
      </div>
      <ToastRegion messages={[{ id: 'gallery', tone: 'success', text: 'The offer was placed.' }]} />
    </AppShell>
  );
}
