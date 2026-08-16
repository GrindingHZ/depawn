# p7b-reconciliation-and-loan-book verify

- pnpm check: exit 0
- pnpm test:unit: exit 0
- pnpm test:integration: exit 0 (25 files, 131 tests)
- pnpm test:e2e: exit 0 (20 tests, one new)

## Flow 10 exit criteria

- The docs/07 criterion is met head on: a receipt row edited behind the application, marked
  released without ever being burned, comes back as a drift row naming the receipt, what the
  records say, and what the count says. Drift is a row to investigate rather than a total.
- Both directions are covered: an item the records expect that nobody counted, and an item counted
  that the records do not know. A matching count produces no drift at all.
- The ledger half checks the two things that can actually be wrong: every transaction's entries net
  to zero and the whole ledger nets to zero. The first version compared a derived balance against a
  sum of the same rows, which could never disagree; that is fixed and the planted imbalance test now
  names the offending transaction.
- The loan book reports outstanding, overdue while still in grace, past grace, and defaulted as
  mutually exclusive buckets, with exposure by vault beside the insured limit.
- Everything is operations only, each with a 403 test, and the endpoints are named as docs/04 names
  them after the review caught the divergence.

## Notes carried forward

- Read model queries inject Prisma directly, a convention that predates this slice and that the
  boundary tool does not flag. Worth deciding deliberately rather than letting it spread.
- The reconciliation screen counts one hardcoded vault. Enough for the demo, not for a real estate
  of vaults.
- Deferred to p7c: versioned protocol parameters and the outbox drain worker.
