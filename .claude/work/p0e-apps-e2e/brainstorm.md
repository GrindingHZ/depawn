# p0e-apps-e2e brainstorm

## What this slice changes

The three Vite React applications from `docs/05-frontend.md` with TanStack Router file-based
routing, TanStack Query for server state, a login screen each, and a role message on the staff
apps. A typed API client for the auth endpoints lands in `packages/contracts/src/client` so no
component calls `fetch`. A seed script creates one account per role. Playwright gets three
projects plus a global setup that migrates and seeds, and a login test per app. A CI workflow runs
every gate. This closes P0.

## Files touched

New: `apps/marketplace`, `apps/vault-console`, `apps/admin` (each: package.json, vite config,
tsconfig, index.html, `src/main.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`,
`src/routes/login.tsx`, generated `routeTree.gen.ts`), `packages/contracts/src/client/*`,
`apps/api/prisma/seed.ts`, `e2e/` workspace with `playwright.config.ts`, `global-setup.ts` and
specs, `.github/workflows/ci.yml`.

Modified: `pnpm-workspace.yaml` (e2e workspace), root `package.json` if script wiring needs it,
`apps/api/package.json` (start script for the Playwright web server).

## Approaches

Styling: none beyond structural HTML now, because `docs/13-design-system.md` freezes tokens in
P0.5 and any colour choice made here would either violate the token check or prejudge the design.
The login screens are plain semantic HTML with test ids. Authentication state: TanStack Query
`me` query with the typed client, no auth context object, because the query cache is the single
source of server state per `docs/05-frontend.md`.

## What could break

The router plugin generates `routeTree.gen.ts` at dev and build time; the generated file is
committed so `tsc --noEmit` works without running Vite. Vite dev servers proxy `/api` to the API
so the SameSite strict cookie holds. Playwright downloads browsers on first run. The e2e global
setup assumes Docker is running for the compose Postgres.

## Ambiguity

P0 names "the shell from packages/ui", but `docs/13-design-system.md` builds `packages/ui` in
P0.5. Narrowest reading: the apps ship without the shared shell and P0.5 introduces it. The vault
console and admin role gates render a plain refusal message; richer handling is product scope for
later phases.
