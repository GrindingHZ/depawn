# Review: p0e-apps-e2e

Diff base 0666c47, 8 commits reviewed. Mechanical verification: pnpm check exit 0,
pnpm test:unit exit 0 (27 tests, 9 files). E2e not rerun here; implementer reports 7/7 green.

## Blocking

- none

## Non-blocking

- docs/05 says the accessibility floor is "not optional and not a later phase" and docs/06 lists
  axe on every push, but no @axe-core/playwright check runs on the two routes each app now has.
  The login forms do have labelled inputs and role alerts, so the risk today is low, but the
  deferral is not recorded anywhere. Add the axe check when P0.5 lands the shell, or record the
  deferral in docs/OPEN-QUESTIONS.md.
- src/routes/login.tsx, src/routes/index.tsx (modulo the role gate), src/current-account.ts,
  src/main.tsx, and src/routes/__root.tsx are byte-identical across the three apps. The
  packages/ui deferral is recorded in the brainstorm, so this is accepted for P0, but P0.5
  should pull the login form and the me-query hook into the shared package rather than letting
  a fourth copy appear.
- The vault-console and admin specs share the seeded staff, ops, and member accounts, against
  the docs/06 rule that each test creates its own accounts. Accepted: staff roles cannot be
  created through the public API, the tests only read those accounts, and the constraint is
  documented in the vault-console spec comment. Revisit when a role-granting test endpoint or
  admin API exists.
- ci.yml triggers on both push and pull_request, so commits on a PR branch run the job twice.
  Restrict push to main or drop one trigger.
- apps/api/prisma/seed.ts ends with "void seed()", so a failure surfaces only as an unhandled
  rejection, and prisma.$disconnect is skipped on error. Node exits non-zero either way, so the
  pipeline still catches it; a catch that logs and exits would make failures easier to read.
- e2e/playwright.config.ts sets Desktop Chrome in the top-level "use" and again in every
  project's "use"; one of the two is redundant.

Checked and clean: no fetch outside packages/contracts/src/client; server state only in the
TanStack Query me query with a typed key factory; no useEffect or useState anywhere in the apps;
Playwright selectors are getByTestId and getByRole only, no CSS selectors, no waitForTimeout, no
assertions on error message text (the wrong-password test asserts alert visibility only);
marketplace tests create unique accounts through the API and assert through the UI; component
files are kebab-case with one component each; no styling and no raw colours anywhere; the client
error fallback code FAULT exists in packages/contracts error-codes; the seed hashes with the
same @node-rs/argon2 default parameters as the API adapter, so seeded logins verify; all eight
commit messages are single line, imperative, lowercase, under 72 characters, with scopes from
the docs/12 list, and no bodies or trailers; scripts/check-prose.sh passes over the new files.

## Verdict

APPROVED
