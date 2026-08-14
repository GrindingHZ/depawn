# 11 — Execution Pipeline

The build runs unattended. No human writes code, reviews a diff by hand, or approves a step. This
document defines the loop, the gates that keep it honest, and the configuration that lets it run
without stopping.

## The loop

One pass through the loop delivers one slice from `docs/07-phase-plan.md`.

```
  ┌─────────────────────────────────────────────────────────────┐
  │                                                             │
  ▼                                                             │
Load state ──▶ Brainstorm ──▶ Plan ──▶ Execute ──▶ Review ──▶ Verify
                                          ▲                     │
                                          │      gate failed    │
                                          └─────────────────────┘
                                                                │ gate passed
                                                                ▼
                                                          Close slice
```

Every stage writes a file. The files are the memory that survives a context reset, a crash, or a
fresh session. If a stage produced no file, the stage did not happen.

```
.claude/
  state/
    STATE.md              current phase, current slice, current stage
    BLOCKERS.md           anything that failed three attempts
  work/
    p05-design-system/
      generated/          raw UI UX Pro Max output, archived evidence
    p4-origination/
      brainstorm.md
      plan.md
      review.md
      verify.md
```

## Stage 0 — Load state

Read, in this order: `CLAUDE.md`, every file in `docs/`, `.claude/state/STATE.md`, and the current
slice folder if one exists. Then read `git log --oneline -20` to see what actually landed.

Resume rule: if `STATE.md` names a slice and a stage, resume at that stage. Do not restart the slice.
Do not re-plan work that is already committed.

## Stage 1 — Brainstorm

Write `.claude/work/<slice>/brainstorm.md`. Not prose musing. It answers five questions:

1. What does this slice change, in one paragraph, in domain language.
2. Which files are touched, listed by path, split into new and modified.
3. What are the two or three viable approaches, and which one is chosen and why. If there is only
   one sane approach, say so in one line and move on.
4. What could break elsewhere. Name the specific tests and flows at risk.
5. What is ambiguous. Anything genuinely undecidable goes in `docs/OPEN-QUESTIONS.md` with the
   narrowest reading implemented, and the loop continues. It never waits for an answer.

Cap this at one page. A long brainstorm is a sign the slice is too big; split it and update
`STATE.md`.

## Stage 2 — Plan

Write `.claude/work/<slice>/plan.md` as an ordered checklist of tasks. Each task is:

- one commit
- independently green, meaning `pnpm check` and the unit suite pass after it
- named with its commit message already written

```markdown
## Tasks

- [ ] feat(domain): add loan entity with maturity and grace windows
- [ ] feat(domain): calculate accrued interest with integer arithmetic
- [ ] test(domain): cover interest accrual boundaries and overflow
- [ ] feat(lending): persist loans and notes through prisma repository
- [ ] feat(lending): originate loan from accepted offer in one transaction
- [ ] test(lending): assert origination idempotency and race safety
- [ ] feat(marketplace): accept offer endpoint with idempotency key
- [ ] feat(marketplace-ui): accept offer flow on listing detail
- [ ] test(e2e): originate a loan from the listing detail screen
```

Task ordering follows the slice ordering in `docs/07-phase-plan.md`: domain, persistence, use case,
endpoint, UI, end-to-end test. Tests are their own tasks and their own commits, never bundled into
the implementation commit.

A plan with more than twelve tasks is too big. Split the slice.

## Stage 2.5 — Design pass

Runs only for slices that touch UI. Skipped silently otherwise.

Read `docs/DESIGN-BRIEF.md` and `docs/13-design-system.md`. Then append a short section to
`plan.md` naming, for each new screen or component:

- which existing primitives from `packages/ui` it composes
- which semantic status tokens it uses, by name
- which empty, loading, and error states it needs

The UI UX Pro Max skill may be queried here for component-level patterns only:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain chart
```

The `--design-system` flag and the `color`, `typography`, `style`, and `landing` domains are banned
outside P0.5. Their appearance in a slice is a blocking review finding.

If a screen needs a value no token provides, the fix is a separate commit adding the token with a
one-line justification, not an inline value.

## Stage 3 — Execute

Work the checklist top to bottom. For each task:

1. Implement it.
2. Run `pnpm check`. Fix anything it reports.
3. Run the unit suite. Fix anything it reports.
4. Commit with the message already written in the plan.
5. Tick the box in `plan.md` and commit that tick with the next task's commit, not its own.

Commit at every green task. Not at the end of the slice. A slice that produces one commit is a
failure of this stage regardless of whether the code works.

Never run `git add -A` from the repository root. Stage the specific paths the task touched.

## Stage 4 — Review

Spawn a fresh subagent as the reviewer. The reviewer has not seen the implementation conversation,
which is the point. Self-review inside the same context finds almost nothing.

The reviewer reads the diff for the slice (`git diff <slice-base>..HEAD`), `docs/09-conventions.md`,
and `docs/02-domain-model.md`, then writes `.claude/work/<slice>/review.md`:

```markdown
## Blocking
- src/domain/lending/loan.ts:42 — imports PrismaService, breaks the domain boundary rule

## Non-blocking
- src/modules/lending/http/loan.controller.ts:18 — response mapper could move to a mapper file

## Verdict
BLOCKED
```

The review checklist is the one at the end of `docs/09-conventions.md`. Nothing is added to it
in the moment; if a new rule is needed, it goes in that document first.

For a UI slice the reviewer additionally checks: no raw colour, font, or pixel spacing value; every
status badge carries a text label as well as a colour; the brainstorm and plan files contain no
banned skill query; and the visual baseline diff, if it changed, has its own commit.

**Blocking findings send the loop back to Stage 3.** Fix them, commit as `fix(scope): ...`, and
re-run the review with a fresh subagent. Non-blocking findings are appended to `plan.md` as new
tasks only if they are cheap; otherwise they are dropped. Do not gold-plate.

## Stage 5 — Verify

Run in this order and stop at the first failure:

```
pnpm check                  typecheck, lint, format, boundaries, prose, design tokens
pnpm test:unit
pnpm test:integration
pnpm test:e2e               includes axe checks and visual regression
```

Write `.claude/work/<slice>/verify.md` with the command, the exit code, and the failing test names
if any. Do not paste full output.

Playwright specifics:

- The suite runs headless against a fresh database and a fresh seed.
- On failure, read the trace, not the screenshot. `pnpm exec playwright show-trace` output goes into
  the verify file as a one-line summary of the failing step.
- A flaky test is a failing test. Do not add a retry to make it green. Find the missing wait
  condition. `waitForTimeout` is never the fix and is banned by `docs/09-conventions.md`.
- If a selector broke because the UI legitimately changed, update the selector. If a selector broke
  because it was a CSS class, replace it with a role or test id and note it in the review file.

Any failure sends the loop back to Stage 3.

## Stage 6 — Iterate, with a bound

The execute, review, verify cycle repeats until every gate is green. It is bounded so the loop can
never wedge:

- **Three attempts** at the same failing gate. Each attempt must try something different from the
  last; write the difference in one line in `verify.md` before attempting.
- On the fourth encounter, stop working the task. Append to `.claude/state/BLOCKERS.md`:

```markdown
## p4-origination / test(lending): assert origination race safety
Attempts: 3
Symptom: both concurrent requests return 201 under SQLite; passes under Postgres
Tried: row lock, serializable isolation, advisory lock
Hypothesis: the test harness is not using Testcontainers Postgres
Next: verify the harness database driver before retrying
```

- Then revert the task's partial work, mark it `[blocked]` in `plan.md`, and move to the next task.
- A slice finishes with blocked tasks. It does not stop the pipeline. The blocker file is what the
  human reads later.

## Stage 7 — Close the slice

1. Every plan task is `[x]` or `[blocked]`.
2. All four verify commands are green, excluding tests for blocked tasks, which are skipped with a
   `test.skip` carrying the blocker id.
3. Update `docs/10-flows.md` if the flow changed.
4. Commit `chore(state): close p4-origination`.
5. Update `STATE.md` to the next slice, stage `brainstorm`.
6. Start the next loop immediately. Do not report, do not summarise, do not wait.

## STATE.md format

```markdown
# State

phase: P4
slice: p4-origination
stage: execute
task: 5
slice-base: 3f9a1c2
started: 2026-08-14T09:12:00Z
```

`slice-base` is the commit the slice branched from, used by the reviewer to compute the diff.

## Running it

### Container first

The pipeline runs with permissions pre-approved, which means an agent with a shell is executing
unattended against your filesystem. Run it in a container or a dedicated worktree with no
credentials, no production database, and no push access to a shared branch. This is the one setup
detail that is not optional.

### The driver

```bash
#!/usr/bin/env bash
# scripts/autopilot.sh
set -uo pipefail

while true; do
  if grep -q '^status: complete' .claude/state/STATE.md 2>/dev/null; then
    echo "pipeline complete"
    break
  fi

  claude -p "$(cat .claude/prompts/loop.md)" \
    --permission-mode acceptEdits \
    --output-format stream-json \
    --verbose \
  | tee -a .claude/state/run.log

  sleep 2
done
```

A fresh session per iteration rather than one long session. Context stays small, compaction never
loses the plan, and a crash costs one iteration instead of the whole run. The state files carry
continuity, not the context window.

### The loop prompt

`.claude/prompts/loop.md`:

```markdown
Read CLAUDE.md, every file in docs/, and .claude/state/STATE.md.

Resume the pipeline in docs/11-execution-pipeline.md at the stage named in STATE.md.
Work until the current slice reaches Stage 7 and STATE.md points at the next slice.

Do not ask questions. Ambiguity goes in docs/OPEN-QUESTIONS.md with the narrowest reading
implemented. Do not report progress in prose. The state files are the report.
```

### Settings

`.claude/settings.json` in the repository, committed:

```json
{
  "attribution": {
    "commit": "",
    "pr": ""
  },
  "permissions": {
    "allow": [
      "Bash(pnpm *)",
      "Bash(npx prisma *)",
      "Bash(git status*)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(docker compose *)",
      "Edit(src/**)",
      "Edit(apps/**)",
      "Edit(packages/**)",
      "Edit(docs/**)",
      "Edit(.claude/state/**)",
      "Edit(.claude/work/**)"
    ],
    "deny": [
      "Bash(git push*)",
      "Bash(rm -rf *)",
      "Read(.env)",
      "Read(**/*.pem)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit-check.sh",
            "args": []
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/slice-gate.sh",
            "args": [],
            "timeout": 900
          }
        ]
      }
    ]
  }
}
```

`attribution` with empty strings removes the co-author trailer and the generated-with line from
commits and pull request bodies. The older `includeCoAuthoredBy` setting does the same thing but is
deprecated, and setting both can conflict. Use `attribution` only.

### The Stop gate

A `Stop` hook fires when Claude finishes responding. Exiting 2 prevents it from stopping and feeds
stderr back as the reason to continue. That is the mechanism that makes the loop run without
intervention.

`.claude/hooks/slice-gate.sh`:

```bash
#!/usr/bin/env bash
set -uo pipefail

input=$(cat)

# Without this guard the gate loops forever. stop_hook_active is true when the
# current turn was itself started by a Stop hook block.
if [ "$(jq -r '.stop_hook_active' <<<"$input")" = "true" ]; then
  exit 0
fi

if grep -q '^status: complete' .claude/state/STATE.md 2>/dev/null; then
  exit 0
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Uncommitted changes remain. Commit the current task before stopping." >&2
  exit 2
fi

if ! pnpm check >/tmp/gate-check.log 2>&1; then
  echo "pnpm check failed. Fix it before stopping. Output in /tmp/gate-check.log" >&2
  exit 2
fi

if ! pnpm test:unit >/tmp/gate-unit.log 2>&1; then
  echo "Unit tests failed. Fix them before stopping. Output in /tmp/gate-unit.log" >&2
  exit 2
fi

exit 0
```

Two things about this script matter. Exit 2 is the only exit code that blocks; exit 1 is treated as
a non-blocking error and the agent stops anyway, which is the most common mistake in hook scripts.
And the `stop_hook_active` guard is what stops an infinite loop when the gate can never pass; Claude
Code also caps consecutive Stop-hook blocks, so a permanently failing gate ends the session with a
warning rather than spinning.

Keep the gate cheap. Full integration and Playwright runs belong in Stage 5, not in a hook that
fires on every turn.

### The edit check

`.claude/hooks/post-edit-check.sh` runs after every edit and is the fast feedback loop. It formats
the changed file, runs the prose check on markdown, and exits 2 with the error text if either fails,
so the agent sees the problem next to the tool result rather than twenty edits later.

## What the pipeline must not do

- **Do not skip the review stage because the change looks small.** The reviewer is a fresh context
  and that is the entire value.
- **Do not weaken a test to make a gate pass.** Deleting an assertion, adding a retry, widening a
  tolerance, or marking a test skipped without a blocker id are all treated as blocking review
  findings.
- **Do not run `git push`.** It is in the deny list. Branches stay local until a human looks.
- **Do not amend or rebase commits already made.** Fixes are new commits.
- **Do not touch `docs/` except `OPEN-QUESTIONS.md` and flow updates.** The blueprint is input, not
  output. A change to a rule needs a human. `docs/DESIGN-BRIEF.md` is written once in P0.5 and is
  read-only afterwards.
- **Do not regenerate the design system.** Not to fix an ugly screen, not to resolve a token gap, not
  ever. See `docs/13-design-system.md`.
- **Do not update a visual baseline to make a diff pass.** A visual diff failing is a real failure.
- **Do not summarise progress in chat.** Nobody is reading it. Write the state files.
- **Do not stop to ask.** Every question either has a narrowest reading or belongs in
  `OPEN-QUESTIONS.md`.

## Bootstrap task

Before P0, one task: `chore(docs): remove em dashes and slop phrasing from the blueprint`.

The blueprint documents were written before `docs/12-writing-and-commits.md` existed and violate it.
Run `scripts/check-prose.sh docs/` and rewrite each flagged line by hand. Do not do this with `sed`;
replacing an em dash with a comma produces comma splices. Read the sentence and recast it.
