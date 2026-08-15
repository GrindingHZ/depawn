# p2d-vault-ui verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (47 api, 31 ui)
- pnpm test:integration: exit 0 (46 tests)
- pnpm test:e2e: exit 0 (11 tests including the cross app intake walk)

One e2e flake was fixed during the slice: the exposure assertion was absolute and broke on the
persisted dev database; it now asserts the delta through the API. Review approved with six
non-blocking findings recorded in review.md.

P2 exit criteria walked across p2a to p2d: the intake wizard produces a receipt the borrower can
see in the marketplace; sealing is irreversible (entity, endpoint, and wizard block); the
exposure endpoint rejects issuance past the insured limit with the concurrency proof; the
custody contract suite passes against the database adapter.
