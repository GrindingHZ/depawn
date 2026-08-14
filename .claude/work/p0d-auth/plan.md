# p0d-auth plan

## Tasks

- [ ] chore(contracts): add zod auth schemas and error codes
- [ ] feat(domain): add account entity with repository hasher and id ports
- [ ] feat(api): add ulid id generator and argon2 password hasher adapters
- [ ] feat(db): add version column to account
- [ ] feat(accounts): persist accounts through a prisma repository
- [ ] feat(accounts): add session cookie auth endpoints
- [ ] feat(accounts): guard routes by role with a current account decorator
- [ ] test(accounts): cover auth flows through http against postgres
