# p0b-domain-kernel verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (5 files, 18 tests, plus the domain event readonly fix re-run)
- pnpm test:integration: exit 0 (no integration tasks exist yet)
- pnpm test:e2e: exit 0 (no e2e tasks exist yet)

The deliberate `Date.now()` probe file in `domain/` failed lint during task 10, proving the purity
rule fires. No failing tests.
