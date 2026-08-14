# p0d-auth plan

## Tasks

- [x] chore(contracts): add zod auth schemas and error codes
- [x] feat(domain): add account entity with repository hasher and id ports
- [x] feat(api): add ulid id generator and argon2 password hasher adapters
- [x] feat(db): add version column to account
- [x] feat(accounts): persist accounts through a prisma repository
- [x] feat(accounts): add session cookie auth endpoints
- [x] feat(accounts): guard routes by role with a current account decorator (shipped inside the
      session cookie auth endpoints commit; the guard was needed for the module to compile, so a
      separate commit would not have been independently green)
- [x] test(accounts): cover auth flows through http against postgres
