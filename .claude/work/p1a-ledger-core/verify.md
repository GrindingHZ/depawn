# p1a-ledger-core verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (59 tests across api and ui, including the balance property tests)
- pnpm test:integration: exit 0 (23 tests: harness, auth, seven contract tests, the 20 round
  concurrency race)
- pnpm test:e2e: exit 0 (7 tests)

P1 core exit criteria walked: the contract suite passes against the ledger adapter; the
concurrency test passes twenty consecutive rounds in one run; the ledger sums to zero after every
money moving test via the matcher, whose failure branch is itself proven by a trigger bypass
probe. Review approved with seven non-blocking findings; four were applied (provisioning race,
append only trigger, release idempotency test, matcher failure proof plus two open questions),
the circular test-support dependency and the untested-by-design items are recorded in review.md.
