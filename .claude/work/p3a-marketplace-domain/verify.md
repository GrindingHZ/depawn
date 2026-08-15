# p3a-marketplace-domain verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (61 api, 31 ui)
- pnpm test:integration: exit 0 (46 tests)
- pnpm test:e2e: exit 0 (11 tests)

Review round 1 blocked on the unregistered LISTING_NOT_DRAFT code and the untested expire
transition; both fixed and approved on round 2. One process deviation recorded in plan.md: the
ranking spec landed inside its feat commit through a pathspec mistake.
