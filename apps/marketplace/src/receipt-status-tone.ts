import type { StatusTone } from '@depawn/ui';

/* The receipt state to tone mapping fixed in docs/DESIGN-BRIEF.md. */
export function receiptStatusTone(status: string): StatusTone {
  switch (status) {
    case 'IN_VAULT':
      return 'active';
    case 'ENCUMBERED':
      return 'warning';
    case 'RELEASED':
      return 'neutral';
    case 'LIQUIDATED':
      return 'danger';
    default:
      return 'neutral';
  }
}
