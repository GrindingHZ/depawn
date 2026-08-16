# p7c-parameters-and-outbox verify

## Gates

| Gate | Result |
|---|---|
| `pnpm check` | clean: typecheck, lint, format, boundaries, prose, tokens |
| Unit | 156 tests across 27 files, all passing |
| Integration | 145 tests across 27 files, all passing |
| Playwright | run with the P8 work, recorded in the p8a verify |

## What the review found and what was done

Three blocking findings, all fixed as new commits.

**The liquidation fee could reach an older loan.** `fix(lending): pin the liquidation fee to the
loan`. The fee is now copied onto the loan at origination beside the rate and the grace deadline,
the waterfall takes a number rather than the live parameters object, and a migration backfills
existing rows at the demo default they were written under. The proof the plan claimed and did not
have now exists: `liquidation.integration.spec.ts` edits the fee to 5000 basis points with a past
effective date and watches the sale still take 200.

**The parameter write and its audit were two transactions.** `fix(admin): write a parameter version
and its audit together`. A `ProtocolParametersPort` in the domain now carries the write through the
caller's transaction, an `UpdateProtocolParametersUseCase` owns the flow, and the controller is
thin again. The registry reloads only after the commit, because a rollback must not leave it
serving a version that never landed. `parameters.integration.spec.ts` makes the audit write fail
and asserts no version survives.

**Task 9 was never built.** `fix(admin): write a parameter version and its audit together` carries
the screen: `/parameters` shows the fees, the full edit history, and the dead letter table, with
`GET /admin/dead-letters` behind the operations role. `admin.parameters.spec.ts` covers the happy
path, the rejected fee, the empty dead letter table, and a member being refused.

Three of the five notes were also fixed: the harness comment, the currency the parameter storage
was dropping, and the missing test for the claim visibility window. The other two became Q-022 and
Q-023, because both are Phase 3 decisions rather than Phase 1 defects.

## What is still true and was checked again

- Origination terms travel with the loan; no path re-reads current parameters for an existing one.
- Money round trips through JSON storage as strings, with no float anywhere.
- Dead lettering is atomic, so an event can be neither lost nor duplicated by that path.
- The drain worker starts only from `main.ts`, unrefs its timer, and stops on module destroy.

P7 is closed.
