Read CLAUDE.md, every file in docs/, and .claude/state/STATE.md.

Resume the pipeline defined in docs/11-execution-pipeline.md at the stage named in STATE.md.
Work until the current slice reaches Stage 7 and STATE.md points at the next slice.

Rules for this run:

- Do not ask questions. Ambiguity goes in docs/OPEN-QUESTIONS.md with the narrowest reading
  implemented, and you continue.
- Do not report progress in prose. The state files are the report.
- Commit at every green task using the message already written in plan.md.
- Three attempts at a failing gate, then record it in .claude/state/BLOCKERS.md and move on.
- Never weaken a test to make a gate pass.
