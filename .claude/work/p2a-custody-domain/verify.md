# p2a-custody-domain verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (47 api tests including 15 new custody specs, 31 ui)
- pnpm test:integration: exit 0 (31 tests)
- pnpm test:e2e: exit 0 (9 tests)

Review round 1 blocked on the locale-dependent hash sort; fixed with a code unit comparison and
approved on round 2. The three new custody error codes joined the contracts table and Q-012
records the docs/02 versus docs/10 divergence on the claim transition.
