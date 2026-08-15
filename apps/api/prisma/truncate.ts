import { PrismaClient } from '@prisma/client';

/* Empties every table but leaves the schema alone. The end to end suite runs
   against a long lived development database, and a vault has an insured
   limit: without this, accumulated receipts from earlier runs eventually
   fill it and intake starts refusing perfectly good items. */
async function truncateAllTables(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    if (rows.length === 0) {
      return;
    }
    const tables = rows.map((row) => `"public"."${row.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`);
  } finally {
    await prisma.$disconnect();
  }
}

void truncateAllTables();
