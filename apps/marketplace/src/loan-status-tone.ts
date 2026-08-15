import type { LoanResponse, LoanStatusDto } from '@depawn/contracts';
import type { StatusTone } from '@depawn/ui';

export interface LoanBadge {
  readonly tone: StatusTone;
  readonly label: string;
}

/* Loan state to tone mapping from docs/DESIGN-BRIEF.md. The switch is
   exhaustive on purpose: a new loan status must not compile until it has a
   tone. */
export function loanStatusTone(status: LoanStatusDto): StatusTone {
  switch (status) {
    case 'ACTIVE':
      return 'active';
    case 'REPAID':
      return 'success';
    case 'DEFAULTED':
      return 'danger';
    case 'LIQUIDATED':
      return 'danger';
  }
}

/* The brief gives a loan past maturity its own warning tone even though the
   status is still ACTIVE, so the badge derives from the clock as well as the
   status. The label never says grace, because an active loan can also sit
   past the end of grace while nobody has marked it defaulted (Q-014). */
export function loanBadgeFor(loan: LoanResponse, nowMilliseconds: number): LoanBadge {
  if (loan.status === 'ACTIVE' && Date.parse(loan.maturesAt) <= nowMilliseconds) {
    return { tone: 'warning', label: 'PAST MATURITY' };
  }
  return { tone: loanStatusTone(loan.status), label: loan.status };
}
