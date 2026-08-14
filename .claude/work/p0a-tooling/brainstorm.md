# p0a-tooling brainstorm

## What this slice changes

Creates the monorepo skeleton every later slice builds inside: pnpm workspaces with the four apps
and four packages from `CLAUDE.md`, Turborepo task wiring, strict TypeScript, ESLint with the layer
boundary rule, Prettier, and a `pnpm check` script that runs typecheck, lint, format check, the
prose check, and the design token check. The commit message hook from `scripts/check-commit-msg.sh`
is wired through husky. No product behaviour.

## Files touched

New: root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`,
`.gitattributes`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`, `.husky/commit-msg`,
`.dependency-cruiser.cjs`, and `scripts/check-boundaries.sh`. Workspace folders are created by the
slices that put real code in them, so this slice ships root configuration only plus
`packages/move/.gitkeep`. Turbo tasks run over whichever workspaces exist, which keeps every
intermediate commit green without placeholder source files.

Modified: none.

## Approaches

Boundary enforcement: `eslint-plugin-boundaries` versus `dependency-cruiser`. Chosen:
`dependency-cruiser`, because its rules live in one config file, it runs as a single command inside
`pnpm check`, and it does not depend on ESLint resolver quirks under pnpm. ESLint still runs for
code style. The other decisions (pnpm, Turborepo, strict tsconfig) are fixed by `CLAUDE.md`, so
there is one sane approach.

## What could break

`scripts/check-prose.sh` scans TypeScript files, so generated or config files with unusual
punctuation could trip it; keep authored comments plain. The commit hook rejects any multi-line
message, which also applies to this slice's own commits. Windows line endings: `.gitattributes`
pins LF for source files so Prettier and the shell scripts agree.

## Ambiguity

The workspace list in `CLAUDE.md` includes `packages/move` as empty until Phase 3; it gets a
placeholder `.gitkeep` only, no `package.json`. Nothing else is undecidable.
