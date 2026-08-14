# p1a-ledger-core plan

## Tasks

- [ ] feat(domain): add ledger entities with the balance invariant
- [ ] test(domain): property test that every transaction balances
- [ ] feat(db): add funds hold table and ledger balance trigger
- [ ] feat(ledger): provision ledger accounts per owner and currency
- [ ] feat(ledger): implement the settlement port on the ledger
- [ ] chore(test-support): add the settlement port contract suite
- [ ] test(ledger): run the contract suite against the ledger adapter
- [ ] test(ledger): prove concurrent holds cannot overdraw
