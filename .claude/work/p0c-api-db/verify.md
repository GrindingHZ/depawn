# p0c-api-db verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (18 tests)
- pnpm test:integration: exit 0 (6 tests against Testcontainers Postgres, including the balanced
  and unbalanced ledger matcher proof)
- pnpm test:e2e: exit 0 (no e2e tasks exist yet)

Environment note: host port 5432 is owned by a native Postgres service on this machine, so the
compose service maps 5433 and every DATABASE_URL default follows.
