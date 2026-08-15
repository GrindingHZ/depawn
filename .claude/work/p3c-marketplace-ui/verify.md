# p3c-marketplace-ui verify

- pnpm check: exit 0
- pnpm test:unit: exit 0 (61 api, 31 ui)
- pnpm test:integration: exit 0 (52 tests). Verify surfaced an intermittent 23505 in the offer
  race: the account provisioning insert named the id as its conflict target while the legacy
  compound owner constraint could surface first under contention; fixed with a targetless
  ON CONFLICT DO NOTHING and the race spec then passed five consecutive runs.
- pnpm test:e2e: exit 0 (13 tests)

Environment note: an unrelated project on this machine took port 5173 between sessions, so the
marketplace dev server moved to 5273 with strictPort across the vite and Playwright configs.

Review rounds: blocked twice (submit-time idempotency keys and a non-persistent reclaim banner,
then the banner still missing on the wallet screen); all fixed and approved on round three with
the non-blocking notes carried in review.md. P3 exit criteria walked: a receipt becomes a funded
listing end to end, losing money stays held until reclaimed, and the ranked book renders by total
borrower cost.
