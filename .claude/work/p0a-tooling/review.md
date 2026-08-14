# p0a-tooling review (re-review after fix)

Re-reviewed `git diff 89f1a33..HEAD` after commit 569c843, which was made to close the single
blocking finding from the previous review. Verified mechanically: the new commit message passes
`scripts/check-commit-msg.sh` (one line, `fix(ci): ...`, lowercase imperative, 71 chars),
`bash scripts/check-prose.sh` exits 0 over the changed files, and `pnpm check` exits 0 end to end.

The fix adds an `http-skips-no-layers` rule to `.dependency-cruiser.cjs` forbidding
`apps/api/src/modules/*/http` from importing `apps/api/src/infrastructure`. This encodes the
missing edge exactly: the layer diagram in docs/01 routes HTTP through application to domain,
with infrastructure reachable only via domain interfaces, so a controller importing
`PrismaService` directly now fails the boundary check. The rule mirrors the shape and severity
of the existing rules and introduces no new violations. The commit also ticks the two remaining
plan.md checkboxes, which resolves the earlier stale-checkbox note. The boundary script still
skips while `apps/api/src` does not exist, which is by design and unchanged by this commit.

## Blocking

None. The prior blocking finding is resolved by 569c843.

## Non-blocking
- .dependency-cruiser.cjs:22 lets the application layer import `@nestjs/*` or `@prisma/client` from npm unchecked, though docs/01 says use cases depend on domain and ports only; consider a rule when the first use case lands.
- eslint.config.mjs:13 carries none of the domain purity rules docs/09 line 137 says to enforce with ESLint (`new Date()`/`Date.now()` outside the clock adapter, `Math.random()`/`crypto.randomUUID()` in domain, `process.env` outside config, `as` casts); domain code does not exist yet, so these must land with p0b at the latest.
- scripts/check-commit-msg.sh accepts any lowercase scope, so the scope list in docs/12 is not enforced, and the commitlint setup docs/12 names under Enforcement was not installed; CLAUDE.md names only the script as the enforcement mechanism, so this reads as a docs/12 internal inconsistency rather than a defect in the slice.
- package.json:11 `db:migrate` and `db:seed` filter on `@depawn/api`, which does not exist until p0c; expected, noted so the p0c slice remembers to claim the name.

## Verdict
APPROVED
