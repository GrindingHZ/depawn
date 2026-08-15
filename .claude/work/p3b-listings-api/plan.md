# p3b-listings-api plan

## Tasks

- [ ] feat(db): add listing and offer tables with an active listing guard
- [ ] feat(domain): add the listing repository interface
- [ ] feat(marketplace): persist listings with their offers through prisma
- [ ] feat(marketplace): bind protocol parameters for every module
- [ ] feat(marketplace): add listing lifecycle use cases
- [ ] feat(marketplace): add offer use cases with funded holds
- [ ] feat(contracts): add marketplace schemas and client calls
- [ ] feat(marketplace): add browse and detail queries with endpoints
- [ ] test(marketplace): cover listing and offer flows through http
- [ ] test(marketplace): prove concurrent offers cannot double spend
