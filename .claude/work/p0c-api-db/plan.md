# p0c-api-db plan

## Tasks

- [x] feat(api): add nestjs application skeleton with health endpoint
- [x] chore(db): add docker compose postgres and prisma tooling
- [x] feat(db): add initial migration for accounts sessions ledger and outbox
- [x] feat(api): add prisma service and unit of work adapter
- [x] feat(api): map domain failures and faults in a global error filter
- [x] feat(api): log requests with a correlation id
- [x] chore(api): add testcontainers harness with fixed clock and truncation
- [x] test(api): prove the harness boots the app against postgres
