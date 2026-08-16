import { describe, expect, it } from 'vitest';
import { DemoClockAdapter } from './demo-clock.adapter';
import type { PrismaService } from '../persistence/prisma.service';

interface Row {
  readonly id: string;
  readonly offsetMs: bigint;
}

/* A stand in for the one table the adapter touches, so the arithmetic and the
   persistence rule can be proved without a database. */
function fakePrisma(initial: Row | null): PrismaService & { row: Row | null } {
  const store = {
    row: initial,
    demoClock: {
      findUnique(): Promise<Row | null> {
        return Promise.resolve(store.row);
      },
      upsert(input: { create: Row; update: { offsetMs: bigint } }): Promise<Row> {
        store.row =
          store.row === null ? input.create : { id: store.row.id, offsetMs: input.update.offsetMs };
        return Promise.resolve(store.row);
      },
    },
  };
  return store as unknown as PrismaService & { row: Row | null };
}

describe('DemoClockAdapter', () => {
  it('reads real time when nothing has moved it', async () => {
    const clock = new DemoClockAdapter(fakePrisma(null));
    await clock.onModuleInit();
    expect(clock.offset).toBe(0n);
    const drift = Number(clock.now().epochMilliseconds) - Date.now();
    expect(Math.abs(drift)).toBeLessThan(1_000);
  });

  /* The point of the whole adapter: a process that did not do the advancing
     still starts at the advanced instant. */
  it('starts where a previous process left the clock', async () => {
    const clock = new DemoClockAdapter(fakePrisma({ id: 'DEMO', offsetMs: 86_400_000n }));
    await clock.onModuleInit();
    const drift = Number(clock.now().epochMilliseconds) - Date.now();
    expect(Math.abs(drift - 86_400_000)).toBeLessThan(1_000);
  });

  it('writes the offset down as it moves', async () => {
    const prisma = fakePrisma(null);
    const clock = new DemoClockAdapter(prisma);
    await clock.onModuleInit();

    await clock.advanceBy(3_600_000n);
    await clock.advanceBy(1_800_000n);
    expect(clock.offset).toBe(5_400_000n);
    expect(prisma.row?.offsetMs).toBe(5_400_000n);

    await clock.reset();
    expect(clock.offset).toBe(0n);
    expect(prisma.row?.offsetMs).toBe(0n);
  });

  it('refuses to move backwards', async () => {
    const clock = new DemoClockAdapter(fakePrisma(null));
    await clock.onModuleInit();
    await expect(clock.advanceBy(-1n)).rejects.toThrow('cannot move backwards');
  });
});
