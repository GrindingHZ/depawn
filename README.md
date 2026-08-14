# Blueprint

Drop this whole folder at the root of a fresh repository. `CLAUDE.md` sits at the root; the rest of
the layout is already correct.

```
CLAUDE.md                       read first
docs/00-product-overview.md     domain, actors, glossary, business rules, non-goals
docs/01-architecture.md         layers, ports, adapters, folder layout, dependency rules
docs/02-domain-model.md         entities, value objects, state machines, invariants
docs/03-ledger-and-money.md     double-entry ledger, money arithmetic, interest maths
docs/04-api-contract.md         endpoints, DTOs, error model, idempotency
docs/05-frontend.md             three apps, routing, state, component conventions
docs/06-testing.md              pyramid, port contracts, Playwright, chain assertions
docs/07-phase-plan.md           P0 to P11, exit criteria, build order
docs/08-web3-migration.md       the pivot: what changes, what does not
docs/09-conventions.md          naming, style, review checklist, what not to do
docs/10-flows.md                every end-to-end flow, step by step
docs/11-execution-pipeline.md   the autonomous loop, gates, hooks, how to run it
docs/12-writing-and-commits.md  commit format and prose rules
docs/13-design-system.md        UI UX Pro Max, token freeze rule, visual regression
docs/OPEN-QUESTIONS.md          unresolved decisions, append rather than guess

.claude/settings.json           permissions, hooks, attribution off
.claude/hooks/slice-gate.sh     Stop hook, blocks stopping mid slice
.claude/hooks/post-edit-check.sh format and prose check after every edit
.claude/prompts/loop.md         the prompt each autopilot iteration runs
.claude/state/STATE.md          current phase, slice, stage
.claude/state/BLOCKERS.md       anything that failed three attempts

scripts/autopilot.sh            the driver loop
scripts/check-prose.sh          punctuation and banned phrase checks
scripts/check-commit-msg.sh     commit-msg git hook
scripts/check-design-tokens.sh  bans raw colour, font, and pixel values outside tokens.css
```

## Running it

Do this in a container or a dedicated worktree with no credentials, no production database, and no
push access. The pipeline runs with permissions pre-approved.

```bash
git init
chmod +x scripts/*.sh .claude/hooks/*.sh
```

Install the design skill before the first run, since P0.5 depends on it:

```
/plugin marketplace add nextlevelbuilder/ui-ux-pro-max-skill
/plugin install ui-ux-pro-max@ui-ux-pro-max-skill
```

Then:

```bash
./scripts/autopilot.sh
```

The loop stops when `.claude/state/STATE.md` reports `status: complete`. Read
`.claude/state/BLOCKERS.md` afterwards for anything it could not finish.

## Before the first run

Resolve `docs/OPEN-QUESTIONS.md` Q-001 (jurisdiction) and Q-003 (item categories). The intake
schema, statutory holding period, and loan to value table all depend on them, and every other
question has a workable narrowest reading the pipeline can proceed with.

The blueprint documents were written before `docs/12-writing-and-commits.md` existed, so
`./scripts/check-prose.sh docs/` currently reports violations. The pipeline's bootstrap task fixes
them before P0 begins.
