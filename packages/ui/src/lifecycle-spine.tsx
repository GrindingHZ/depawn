import type { ReactElement } from 'react';
import type { MarketRole } from './market-delta';

export type SpineState = 'done' | 'current' | 'ahead' | 'risk';

export interface SpineStage {
  readonly key: string;
  readonly label: string;
  readonly state: SpineState;
}

/* The same loan told twice. A borrower is walking their item from the counter
   back to the counter; a lender is walking their money out and hoping it
   comes back. Neither sequence is the other one renamed, which is why there
   are two lists rather than one list with a translation table. */
const borrowerStages = ['receipt', 'listed', 'funded', 'maturing', 'redeemed'] as const;
const lenderStages = ['offered', 'competing', 'funded', 'risk', 'settled'] as const;

const labels: Record<string, string> = {
  receipt: 'Receipt',
  listed: 'Listed',
  funded: 'Funded',
  maturing: 'Maturing',
  redeemed: 'Redeemed',
  offered: 'Offered',
  competing: 'Competing',
  risk: 'Default risk',
  settled: 'Settled',
};

/* Where the thing currently is, per side. A status the reader's side has no
   opinion about falls back to the opening stage rather than throwing, because
   a spine that disappears is worse than a spine that is merely early. */
const positions: Record<MarketRole, Record<string, string>> = {
  borrower: {
    DRAFT: 'receipt',
    ACTIVE: 'listed',
    MATCHED: 'funded',
    LOAN_ACTIVE: 'funded',
    LOAN_MATURING: 'maturing',
    REPAID: 'redeemed',
    RELEASED: 'redeemed',
    DEFAULTED: 'maturing',
    LIQUIDATED: 'redeemed',
    CANCELLED: 'receipt',
    EXPIRED: 'receipt',
  },
  lender: {
    DRAFT: 'offered',
    ACTIVE: 'offered',
    OFFERED: 'competing',
    MATCHED: 'funded',
    LOAN_ACTIVE: 'funded',
    LOAN_MATURING: 'funded',
    REPAID: 'settled',
    RELEASED: 'settled',
    DEFAULTED: 'risk',
    LIQUIDATED: 'settled',
    CANCELLED: 'offered',
    EXPIRED: 'offered',
  },
};

export function spineFor(
  role: MarketRole,
  status: string,
  isAtRisk = false,
): readonly SpineStage[] {
  const keys = role === 'borrower' ? borrowerStages : lenderStages;
  const currentKey = positions[role][status] ?? keys[0];
  const currentIndex = Math.max(
    keys.findIndex((key) => key === currentKey),
    0,
  );

  return keys.map((key, index) => {
    if (index < currentIndex) {
      return { key, label: labels[key] ?? key, state: 'done' as const };
    }
    if (index > currentIndex) {
      return { key, label: labels[key] ?? key, state: 'ahead' as const };
    }
    return {
      key,
      label: labels[key] ?? key,
      state: isAtRisk || key === 'risk' ? ('risk' as const) : ('current' as const),
    };
  });
}

const dotClasses: Record<SpineState, string> = {
  done: 'bg-accent',
  current: 'bg-status-active',
  ahead: 'bg-edge-strong',
  risk: 'bg-status-warning',
};

const textClasses: Record<SpineState, string> = {
  done: 'text-ink-primary',
  current: 'text-status-active',
  ahead: 'text-ink-secondary',
  risk: 'text-status-warning',
};

/* State is spelled out for a screen reader rather than left to the dot,
   because a coloured circle is the definition of colour as the only signal. */
const readings: Record<SpineState, string> = {
  done: 'done',
  current: 'now',
  ahead: 'still to come',
  risk: 'needs attention',
};

export interface LifecycleSpineProps {
  readonly role: MarketRole;
  readonly stages: readonly SpineStage[];
  readonly onSelectStage?: (key: string) => void;
}

export function LifecycleSpine({ role, stages, onSelectStage }: LifecycleSpineProps): ReactElement {
  return (
    <nav
      aria-label={
        role === 'borrower' ? 'Your item, stage by stage' : 'Your position, stage by stage'
      }
      className="flex items-center gap-1 overflow-x-auto bg-surface-sunken px-4 py-2"
    >
      {stages.map((stage, index) => (
        <span key={stage.key} className="flex items-center gap-1">
          {index === 0 ? null : <span aria-hidden="true" className="h-px w-6 bg-edge" />}
          <button
            type="button"
            onClick={() => onSelectStage?.(stage.key)}
            aria-current={stage.state === 'current' ? 'step' : undefined}
            className={`flex items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1 font-mono text-xs transition-colors duration-control ease-enter hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-status-active ${textClasses[stage.state]}`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${dotClasses[stage.state]}`}
            />
            {stage.label}
            <span className="sr-only">, {readings[stage.state]}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}
