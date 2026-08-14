# Design brief

Written once in P0.5 from the reconciled generator output and read-only afterwards. Every UI
slice reads this file in stage 0 instead of re-querying the design skill for direction. The raw
generator evidence is archived under `.claude/work/p05-design-system/generated/`.

## Chosen style

Calm financial slate on light surfaces with a single green accent, from the marketplace
generation. Chosen because all three applications are data dense and the vault console lives on a
fixed terminal in a lit room; a dark theme optimises for the wrong environment.

## Token table

| Token | Value | Intended use |
|---|---|---|
| `--color-surface-base` | `#f8fafc` | Page background |
| `--color-surface-raised` | `#ffffff` | Cards, dialogs, table rows, inputs |
| `--color-surface-sunken` | `#e2e8f0` | Skeletons, wells, disabled fills |
| `--color-text-primary` | `#0f172a` | Headings and body text |
| `--color-text-secondary` | `#475569` | Labels, captions, secondary copy |
| `--color-text-inverse` | `#ffffff` | Text on accent and status fills |
| `--color-border` | `#cbd5e1` | Hairlines, input borders, table rules |
| `--color-accent-default` | `#15803d` | Primary actions only |
| `--color-accent-hover` | `#166534` | Primary action hover |
| `--color-status-neutral` | `#64748b` | Draft, pending, informational states |
| `--color-status-active` | `#0369a1` | Live states and focus outlines |
| `--color-status-success` | `#15803d` | Completed and repaid states |
| `--color-status-warning` | `#b45309` | Time pressure and at-risk states |
| `--color-status-danger` | `#b91c1c` | Defaults, failures, destructive actions |
| `--font-heading` | IBM Plex Sans | Headings |
| `--font-body` | IBM Plex Sans | Body and UI copy |
| `--font-mono` | IBM Plex Mono | Amounts, rates, ids, settlement references |
| `--space-1` to `--space-8` | 0.25 to 2 rem | The only spacing scale |
| `--radius-sm/md/lg` | 0.25/0.5/0.75 rem | Badges / inputs and buttons / cards |
| `--density-row-height` | 2.5rem (3rem terminal) | Row and control heights |

## Status colour to domain state mapping

| Tone | Listing | Offer | Loan | Receipt | Liquidation | Reconciliation |
|---|---|---|---|---|---|---|
| neutral | DRAFT, EXPIRED, CANCELLED | EXPIRED, WITHDRAWN, SUPERSEDED | none | RELEASED | CANCELLED, SCHEDULED | not run |
| active | ACTIVE | PENDING | ACTIVE | IN_VAULT | BIDDING | running |
| success | MATCHED | ACCEPTED | REPAID | none | SETTLED | clean |
| warning | none | none | past maturity, in grace | ENCUMBERED | none | none |
| danger | none | none | DEFAULTED, LIQUIDATED | LIQUIDATED | none | drift |

Every badge carries its state name as text; colour is never the only signal.

## Typography scale

| Level | Size | Use |
|---|---|---|
| `text-lg` semibold heading | 1.125rem | Dialog and page section titles |
| `text-base` semibold heading | 1rem | Card titles, shell product name |
| `text-sm` body | 0.875rem | Default UI copy, tables, forms |
| `text-xs` medium uppercase | 0.75rem | Status badges only |

## Terminal density rules

The vault console sets `data-surface="terminal"` on the shell and inherits everything except:
row height 3rem, `--space-4` tightened to 0.75rem, and secondary text darkened to `#334155`.
No other overrides are permitted; the palette never forks.

## Contrast ratios

Measured with the WCAG relative luminance formula. AA requires 4.5:1 for body text.

| Pair | Ratio |
|---|---|
| text-primary on surface-base | 17.06:1 |
| text-primary on surface-raised | 17.85:1 |
| text-secondary on surface-base | 7.24:1 |
| text-secondary on surface-raised | 7.58:1 |
| terminal text-secondary on surface-base | 9.90:1 |
| text-inverse on accent-default | 5.02:1 |
| text-inverse on accent-hover | 7.13:1 |
| text-inverse on status-danger | 6.47:1 |
| status-neutral text on surface-base | 4.55:1 |
| status-active text on surface-base | 5.67:1 |
| status-success text on surface-base | 4.79:1 |
| status-warning text on surface-base | 4.80:1 |
| status-danger text on surface-base | 6.18:1 |

## The five UX rules this product cares about most

1. Focus states are visible on every interactive element; the console is keyboard first.
2. Text contrast meets AA on every pair above; status text tones stay above 4.5:1.
3. No emoji as icons; SVG only, and status is always carried by words.
4. Hover and transition timing stays in the 150 to 300 ms band.
5. Loading states are skeletons matching the final layout, never spinners.
