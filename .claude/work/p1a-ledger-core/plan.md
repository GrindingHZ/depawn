# p1a-ledger-core plan

## Tasks

- [x] feat(domain): add ledger entities with the balance invariant
- [x] test(domain): property test that every transaction balances
- [x] feat(db): add funds hold table and ledger balance trigger
- [x] feat(ledger): provision ledger accounts per owner and currency
- [x] feat(ledger): implement the settlement port on the ledger
- [x] chore(test-support): add the settlement port contract suite
- [x] test(ledger): run the contract suite against the ledger adapter
- [x] test(ledger): prove concurrent holds cannot overdraw
