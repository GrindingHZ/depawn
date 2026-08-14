# p0e-apps-e2e verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (27 tests)
- pnpm test:integration: exit 0 (14 tests, Testcontainers Postgres)
- pnpm test:e2e: exit 0 (7 Playwright tests across the three apps)

P0 exit criteria walked:
- pnpm check and pnpm test green: yes, above.
- A Playwright test logs in to each app: marketplace, vault console, and admin login specs pass.
- The boundary rule fails a deliberate domain-imports-Prisma file: probed during verify; the
  probe file produced one dependency violation and was removed. The same was proven for
  Date.now() in domain during p0b.

P0 is complete across its five slices: p0a-tooling, p0b-domain-kernel, p0c-api-db, p0d-auth,
p0e-apps-e2e.
