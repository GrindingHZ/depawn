# p2c-intake-api verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (47 api, 31 ui)
- pnpm test:integration: exit 0 (46 tests: prior suites plus 4 intake flow tests and 2 twenty
  round custody race proofs)
- pnpm test:e2e: exit 0 (9 tests)

Review round 1 blocked on the same-intake double issuance race; fixed with lock-before-replay
ordering plus a unique index backstop and a dedicated race test, approved on round 2. The p2b
carry-forward (vault lock concurrency proof) is closed by the vault-level race test.
