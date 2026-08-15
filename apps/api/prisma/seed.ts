import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';
import { loadConfiguration } from '../src/config/configuration';

export const demoPassword = 'demo-password-123';

const demoAccounts = [
  { email: 'member@demo.test', roles: ['MEMBER'] },
  { email: 'lender@demo.test', roles: ['MEMBER'] },
  { email: 'staff@demo.test', roles: ['VAULT_STAFF'] },
  { email: 'ops@demo.test', roles: ['OPERATIONS'] },
  { email: 'compliance@demo.test', roles: ['COMPLIANCE'] },
] as const;

async function seed(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: loadConfiguration().databaseUrl });
  const passwordHash = await hash(demoPassword);

  for (const account of demoAccounts) {
    await prisma.account.upsert({
      where: { email: account.email },
      update: { roles: [...account.roles] },
      create: { id: ulid(), email: account.email, passwordHash, roles: [...account.roles] },
    });
  }

  await prisma.vault.upsert({
    where: { id: 'VAULT-DEMO-1' },
    update: {},
    create: {
      id: 'VAULT-DEMO-1',
      name: 'Sydney vault',
      city: 'Sydney',
      insuredLimitMinorUnits: 100_000_000n,
      currency: 'AUD',
    },
  });

  await prisma.$disconnect();
}

void seed();
