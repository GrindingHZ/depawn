# p1b-wallet verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (32 api, 31 ui)
- pnpm test:integration: exit 0 (31 tests). One flake surfaced during verify: the idempotency
  race test asserted [201, 409] but [201, 201] with identical bodies is also legal when the loser
  arrives after completion and replays. The assertion now accepts both outcomes and always
  requires exactly one DEPOSIT transaction; the spec ran three consecutive times green.
- pnpm test:e2e: exit 0 (9 tests including the cross app deposit)

Review round 1 blocked on the same-key race and crash window in the idempotency mechanism; fixed
with claim-before-execute (commit series through the race test) and approved on round 2 with two
narrow residual hazards recorded as non-blocking in review.md. P1 exit criteria walked: contract
suite green against the ledger adapter, concurrency proofs green, ledger sums to zero after every
integration test.
