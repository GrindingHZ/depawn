# p3b-listings-api verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (61 api, 31 ui)
- pnpm test:integration: exit 0 (52 tests: prior suites plus 5 marketplace flow tests and the 20
  round offer double spend race)
- pnpm test:e2e: exit 0 (11 tests)

Review round 1 blocked on the member controller's direct repository access; fixed with
MyListingsQuery and approved on round 2 with nine non-blocking notes carried in review.md. One
mid-slice correction: place-offer originally held funds before validating and the integration
test caught the ordering against flow 3; the validation probe now runs first.
