# p3b-listings-api plan

## Tasks

- [x] feat(db): add listing and offer tables with an active listing guard
- [x] feat(domain): add the listing repository interface
- [x] feat(marketplace): persist listings with their offers through prisma
- [x] feat(marketplace): bind protocol parameters for every module
- [x] feat(marketplace): add listing lifecycle use cases
- [x] feat(marketplace): add offer use cases with funded holds
- [x] feat(contracts): add marketplace schemas and client calls
- [x] feat(marketplace): add browse and detail queries with endpoints
- [x] test(marketplace): cover listing and offer flows through http
- [x] test(marketplace): prove concurrent offers cannot double spend
