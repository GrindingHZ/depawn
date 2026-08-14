/* Layer rules from docs/01-architecture.md. The domain imports nothing from the
   other layers; infrastructure implements domain interfaces; application
   orchestrates; HTTP translates. */
module.exports = {
  forbidden: [
    {
      name: 'domain-imports-no-infrastructure',
      severity: 'error',
      from: { path: '^apps/api/src/domain' },
      to: { path: '^apps/api/src/(infrastructure|modules|config)' },
    },
    {
      name: 'domain-imports-no-frameworks',
      severity: 'error',
      from: { path: '^apps/api/src/domain' },
      to: {
        dependencyTypes: ['npm'],
        path: '(@nestjs|@prisma|prisma|@mysten)',
      },
    },
    {
      name: 'application-skips-no-layers',
      severity: 'error',
      from: { path: '^apps/api/src/modules/[^/]+/application' },
      to: { path: '^apps/api/src/(infrastructure|modules/[^/]+/http)' },
    },
    {
      name: 'infrastructure-owns-no-use-cases',
      severity: 'error',
      from: { path: '^apps/api/src/infrastructure' },
      to: { path: '^apps/api/src/modules' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.base.json' },
  },
};
