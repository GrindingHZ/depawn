import type { StatusTone } from '@depawn/ui';

/* Loan state to tone mapping from docs/DESIGN-BRIEF.md. A defaulted loan is
   the one state that must read as a problem on sight. */
export function loanStatusTone(status: string): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'REPAID':
      return 'success';
    case 'DEFAULTED':
      return 'danger';
    default:
      return 'neutral';
  }
}
