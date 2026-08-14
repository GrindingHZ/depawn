# p0b-domain-kernel review

Reviewed b29a8ea..eaa53de (10 commits) against docs/01, docs/02, docs/09, docs/12, and the
slice brainstorm. Mechanical verification: pnpm check exit 0, pnpm test:unit exit 0 (18 tests,
5 files), both re-run with turbo --force to bypass the cache. All 10 commit messages pass
scripts/check-commit-msg.sh. Port signatures match docs/01 exactly, Money and Instant match
docs/02, the DomainEvent union matches docs/02 field for field, domain files import nothing
from infrastructure or frameworks, and dependency-cruiser reports no violations.

## Blocking
- none

## Non-blocking
- eslint.config.mjs:27, the domain purity block exempts spec files, so a test inside domain/
  may call Date.now() or new Date(); docs/09 states the clock rule without a test exemption,
  and the FixedClockAdapter already removes any need for ambient time in tests.
- eslint.config.mjs:29, banning the process global does not catch an explicit
  import from 'node:process', and the dependency-cruiser npm rule does not cover node core
  modules, leaving a narrow path to environment access from domain code.
- apps/api/src/domain/shared/domain-event.ts:18, event variant fields are not readonly; the
  shape copies docs/02 verbatim, but docs/09 asks for readonly by default, so consider adding
  readonly when the first publisher lands.

## Verdict
APPROVED
