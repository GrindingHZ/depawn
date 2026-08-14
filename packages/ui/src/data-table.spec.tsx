import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DataTable } from './data-table';

interface LoanRow {
  readonly id: string;
  readonly status: string;
}

const columns = [
  { key: 'id', header: 'Loan', render: (row: LoanRow) => row.id },
  { key: 'status', header: 'Status', render: (row: LoanRow) => row.status },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(
      <DataTable
        columns={columns}
        rows={[{ id: 'L1', status: 'Active' }]}
        rowKey={(row) => row.id}
        emptyTitle="No loans"
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Loan' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Active' })).toBeTruthy();
  });

  it('falls back to the empty state without rows', () => {
    render(
      <DataTable columns={columns} rows={[]} rowKey={(row) => row.id} emptyTitle="No loans" />,
    );
    expect(screen.getByText('No loans')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});
