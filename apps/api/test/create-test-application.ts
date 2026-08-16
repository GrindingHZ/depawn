import { execFileSync } from 'node:child_process';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { AppModule } from '../src/app.module';
import { CLOCK_PORT } from '../src/domain/ports/clock.port';
import { Instant } from '../src/domain/shared/instant';
import { FixedClockAdapter } from '../src/infrastructure/clock/fixed-clock.adapter';
import { ProtocolParametersRegistry } from '../src/infrastructure/parameters/protocol-parameters.registry';
import { PrismaService } from '../src/infrastructure/persistence/prisma.service';

export interface TestApplication {
  readonly app: INestApplication;
  readonly prisma: PrismaService;
  readonly clock: FixedClockAdapter;
  truncateAllTables(): Promise<void>;
  close(): Promise<void>;
}

function applyMigrations(databaseUrl: string): void {
  const apiRoot = path.resolve(__dirname, '..');
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}

export async function createTestApplication(): Promise<TestApplication> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16')
    .withDatabase('depawn_test')
    .withUsername('depawn')
    .withPassword('depawn')
    .start();

  const databaseUrl = container.getConnectionUri();
  applyMigrations(databaseUrl);
  process.env.DATABASE_URL = databaseUrl;

  // 2026-01-01T00:00:00Z. A constant start keeps time-dependent tests
  // reproducible across runs.
  const clock = new FixedClockAdapter(Instant.fromEpochMilliseconds(1_767_225_600_000n));

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK_PORT)
    .useValue(clock)
    .compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  await app.init();

  const prisma = app.get(PrismaService);

  return {
    app,
    prisma,
    clock,
    async truncateAllTables(): Promise<void> {
      const rows = await prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      `;
      if (rows.length === 0) {
        return;
      }
      const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
      // The parameters registry holds the versions in memory, so emptying
      // the tables underneath it would otherwise leave it answering with
      // versions that no longer exist.
      await app.get(ProtocolParametersRegistry).refresh();
    },
    async close(): Promise<void> {
      await app.close();
      await container.stop();
    },
  };
}
