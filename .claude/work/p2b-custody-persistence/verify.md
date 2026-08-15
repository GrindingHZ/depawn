# p2b-custody-persistence verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (47 api, 31 ui)
- pnpm test:integration: exit 0 (40 tests: prior suites plus 6 custody contract tests and 3
  repository tests)
- pnpm test:e2e: exit 0 (9 tests)

Review round 1 blocked on missing repository and exposure coverage; fixed with
custody-repositories.integration.spec.ts and approved on round 2. Carried forward: the vault
lock's concurrency proof lands with the p2c issue-receipt race test and is blocking there if
p2c ships without it.
