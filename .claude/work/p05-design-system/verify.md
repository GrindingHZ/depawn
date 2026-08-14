# p05-design-system verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (55 tests across api, contracts implicit, and ui)
- pnpm test:integration: exit 0 (14 tests; first run failed because the Docker daemon had stopped
  between sessions, restarted and green)
- pnpm test:e2e: exit 0 (7 tests, restyled screens)

Exit criteria walked: tokens.css committed and the only raw value file; preset consumed by all
three apps; every primitive unit tested and shown on /gallery; DESIGN-BRIEF.md committed with
recomputed contrast ratios; the bg-[#ff0000] probe fails pnpm check; generator outputs archived.
Review approved with six non-blocking findings; the rate sign fix was applied, the rest are
recorded in review.md.
