import type { ReactElement, ReactNode } from 'react';
import { EmptyState } from './empty-state';

export interface DataTableColumn<Row> {
  readonly key: string;
  readonly header: string;
  readonly render: (row: Row) => ReactNode;
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly emptyTitle: string;
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyTitle,
}: DataTableProps<Row>): ReactElement {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} />;
  }

  return (
    <table className="w-full border-collapse font-body text-sm">
      <thead>
        <tr className="border-b border-edge text-left">
          {columns.map((column) => (
            <th key={column.key} scope="col" className="h-row px-3 font-medium text-ink-secondary">
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b border-edge text-ink-primary">
            {columns.map((column) => (
              <td key={column.key} className="h-row px-3">
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
