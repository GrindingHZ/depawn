# 12 — Writing and Commits

Applies to commit messages, code comments, documentation, pull request bodies, UI copy, error
messages, and anything else the pipeline writes. Every rule here is checked mechanically by
`scripts/check-prose.sh`, which runs inside `pnpm check`.

## Commits

### Format

One line. Nothing else.

```
feat(marketplace): accept offer and originate loan
```

```
<type>(<scope>): <summary>
```

- Lowercase type, lowercase scope, lowercase summary.
- Imperative mood. "add", not "adds" or "added".
- No full stop at the end.
- Under 72 characters total.
- No body. No bullet list. No blank line and paragraph underneath.
- No trailers. No `Co-Authored-By`. No `Generated with`. No `Signed-off-by`.
- No emoji. Not in the summary, not anywhere.
- No issue reference in the summary; branch names carry that.

### Types

| Type | Use for |
|---|---|
| `feat` | New behaviour a user or caller can observe |
| `fix` | Correcting behaviour that was wrong |
| `test` | Adding or changing tests only |
| `refactor` | Restructuring with no behaviour change |
| `chore` | Tooling, config, state files, dependencies |
| `docs` | Documentation only |
| `perf` | Performance with no behaviour change |
| `ci` | Pipeline and workflow configuration |

`style` is not a type here. Formatting is automatic and never gets its own commit.

### Scopes

Drawn from the module and app names, nothing invented:

```
domain  ledger  custody  marketplace  lending  liquidation  accounts  admin
api  marketplace-ui  vault-console  admin-ui  contracts  ui  e2e
db  ci  deps  state  move  indexer
flows  demo  events  operations  parameters  seed  config
```

The second row of names arrived with the subsystems that needed them. Adding one is a deliberate
act: put it here and in `scripts/check-commit-msg.sh`, which rejects anything else. That check was
advisory prose until P8, when four invented scopes went in unnoticed, which is exactly the kind of
thing a machine should be catching rather than a reader.

### Examples

```
feat(custody): issue receipt from a sealed intake record
feat(ledger): hold and refund funds through the settlement port
fix(lending): stop interest accruing past maturity
test(marketplace): cover concurrent offer acceptance
refactor(domain): extract the loan to value policy
chore(deps): add fast-check for property tests
chore(state): close p3-listings-and-offers
docs(flows): record the pull based refund decision
```

Wrong, and why:

```
feat: add stuff                                    no scope, meaningless summary
feat(marketplace): Added the accept offer endpoint  past tense, capitalised
feat(marketplace): accept offer.                    trailing full stop
✨ feat(marketplace): accept offer                  emoji
feat(marketplace): accept offer and originate the loan and refund losing offers
                                                    three changes, three commits
```

### Enforcement

`commitlint` with `@commitlint/config-conventional`, plus a local rule set that forbids a body,
forbids trailers, and restricts scopes to the list above. Wired to a `commit-msg` git hook through
`husky` so a malformed message is rejected at commit time rather than found in review.

```js
// commitlint.config.js
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-length': [2, 'always', 0],
    'scope-empty': [2, 'never'],
    'scope-enum': [2, 'always', allowedScopes],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 72],
    'signed-off-by': [2, 'never'],
  },
};
```

## Prose

### Punctuation

**No em dashes.** Not in code comments, not in documentation, not in UI copy, not in commit
messages. Use a comma, a colon, a semicolon, parentheses, or two sentences.

```
Wrong:  The receipt burns at request time — not at the counter.
Right:  The receipt burns at request time, not at the counter.

Wrong:  Three things matter here — atomicity, ordering, and idempotency.
Right:  Three things matter here: atomicity, ordering, and idempotency.

Wrong:  Pausing blocks entrances — never exits.
Right:  Pausing blocks entrances. It never blocks exits.
```

No en dashes in prose either. In a numeric range, write "P0 to P11" or "3 to 8 steps".

**Straight quotes and apostrophes only.** Curly quotes break `grep`, produce noisy diffs, and paste
badly into terminals. `'` and `"`, never `'`, `"`, `"`, or `"`.

No ellipsis character. Three full stops if you truly need them, and you usually do not.

### Banned phrases

These are the tells. Rewrite the sentence rather than swapping in a synonym.

Openers and connectives: "It's worth noting that", "It's important to note", "That said", "At the end
of the day", "When it comes to", "In today's", "Let's dive in", "Let's explore", "In this section we
will".

Verbs and adjectives used as filler: "delve", "leverage" as a verb, "utilise" where "use" works,
"seamless", "robust" with nothing behind it, "comprehensive", "cutting-edge", "elevate", "unlock",
"streamline", "empower", "game-changer", "best-in-class", "powerful" as a bare claim.

Constructions: "not just X, but Y". "X isn't just A, it's B". "Whether you're X or Y". Rhetorical
questions as section openers. A closing "In summary" or "Overall" paragraph that restates what was
just said.

Hedging stacks: "may potentially", "could possibly", "generally tends to".

### Structure

- Sentence case headings. "Domain model", not "Domain Model".
- No emoji anywhere. Status is carried by words, in the UI as much as in the docs.
- No bold-lead bullets where every bullet starts with a bold phrase and a colon. Occasionally fine,
  never the default shape of a list.
- Do not end a document with a summary of the document.
- Prefer the specific to the abstract. "Rejects a bid below the reserve price" beats "handles
  validation appropriately".
- Say the thing once. If a paragraph restates the paragraph above it in different words, delete one.

### Code comments

Covered in `docs/09-conventions.md`, restated because it is the rule most often broken: comments
explain why, never what. A comment that restates the code is deleted and the identifier is renamed
instead.

### UI copy and error messages

- Plain, short, second person. "You cannot list an item while it secures a loan."
- No exclamation marks.
- No apology theatre. "Something went wrong" is worse than "The offer was already withdrawn."
- Every error message maps to an error code in `packages/contracts`. Copy can change freely; the
  code cannot.
- Never blame the user, never blame the system, just say what happened and what to do next.

## The checker

`scripts/check-prose.sh` is the mechanical enforcement. It runs over markdown and TypeScript,
catches punctuation and banned phrases, and exits non-zero on any hit. It is a grep, not a language
model, so it finds the mechanical violations only. Judgement calls stay with the review stage in
`docs/11-execution-pipeline.md`.

It skips this file and the checker scripts, since all three have to quote the banned patterns in
order to define them.

`scripts/check-commit-msg.sh` is the `commit-msg` git hook. It rejects a multi-line message, an
attribution trailer, an em dash, an emoji, a header over 72 characters, or anything that does not
match `type(scope): lowercase imperative summary`.

Wire both up:

```json
{
  "scripts": {
    "check": "turbo run typecheck lint && prettier --check . && ./scripts/check-prose.sh ."
  }
}
```

```bash
# .husky/commit-msg
./scripts/check-commit-msg.sh "$1"
```

Running `./scripts/check-prose.sh docs/` against the blueprint as written today reports violations
in every document. That is expected and is the bootstrap task described at the end of
`docs/11-execution-pipeline.md`. Fix them by reading each sentence and recasting it, never with
`sed`, because replacing an em dash with a comma produces comma splices.
