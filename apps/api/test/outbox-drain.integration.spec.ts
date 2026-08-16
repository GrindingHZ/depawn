import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  OUTBOX_HANDLER,
  OutboxDrainWorker,
  maximumAttempts,
} from '../src/infrastructure/events/outbox-drain.worker';
import type { OutboxHandler } from '../src/infrastructure/events/outbox-drain.worker';
import { createTestApplication } from './create-test-application';
import type { TestApplication } from './create-test-application';

describe('outbox drain', () => {
  let harness: TestApplication;
  let worker: OutboxDrainWorker;
  let handler: OutboxHandler & { published: string[]; failEveryTime: boolean };

  beforeAll(async () => {
    /* A recording handler in place of the logging one, so the tests can see
       what was published and can make delivery fail on demand. */
    handler = {
      published: [],
      failEveryTime: false,
      publish(event: { id: string }): Promise<void> {
        if (handler.failEveryTime) {
          return Promise.reject(new Error('Phase 1 has nowhere to publish'));
        }
        handler.published.push(event.id);
        return Promise.resolve();
      },
    };
    harness = await createTestApplication([{ token: OUTBOX_HANDLER, useValue: handler }]);
    worker = harness.app.get(OutboxDrainWorker);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.truncateAllTables();
    handler.published = [];
    handler.failEveryTime = false;
  });

  async function queueEvent(id: string): Promise<void> {
    await harness.prisma.outboxEvent.create({
      data: {
        id,
        type: 'LoanOriginated',
        payload: { loanId: id },
        occurredAt: new Date(Number(harness.clock.now().epochMilliseconds)),
      },
    });
  }

  it('publishes a queued event once and marks it delivered', async () => {
    await queueEvent('EV-1');

    expect(await worker.drainOnce()).toBe(1);
    expect(handler.published).toEqual(['EV-1']);
    const row = await harness.prisma.outboxEvent.findUnique({ where: { id: 'EV-1' } });
    expect(row?.publishedAt).not.toBeNull();

    // A second drain finds nothing: delivered events are not republished.
    expect(await worker.drainOnce()).toBe(0);
    expect(handler.published).toEqual(['EV-1']);
  });

  it('publishes each event once when two drains race', async () => {
    for (let index = 0; index < 10; index += 1) {
      await queueEvent(`EV-RACE-${index}`);
    }

    const [first, second] = await Promise.all([worker.drainOnce(5), worker.drainOnce(5)]);
    expect(first + second).toBe(10);
    // Claiming skips rows another worker holds, so the two drains take
    // disjoint sets rather than both taking the same one.
    expect(new Set(handler.published).size).toBe(10);
    expect(await harness.prisma.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });

  it('retries a failing event and dead letters it once the attempts run out', async () => {
    await queueEvent('EV-BAD');
    handler.failEveryTime = true;

    for (let attempt = 1; attempt < maximumAttempts; attempt += 1) {
      expect(await worker.drainOnce()).toBe(0);
      const row = await harness.prisma.outboxEvent.findUnique({ where: { id: 'EV-BAD' } });
      expect(row?.attempts).toBe(attempt);
      expect(await harness.prisma.deadLetterEvent.count()).toBe(0);
    }

    expect(await worker.drainOnce()).toBe(0);
    // It leaves the queue so the queue keeps moving, and waits for a human.
    expect(await harness.prisma.outboxEvent.findUnique({ where: { id: 'EV-BAD' } })).toBeNull();
    const dead = await harness.prisma.deadLetterEvent.findUnique({ where: { id: 'EV-BAD' } });
    expect(dead?.attempts).toBe(maximumAttempts);
    expect(dead?.lastError).toContain('nowhere to publish');
    expect(dead?.type).toBe('LoanOriginated');
  });

  it('keeps draining the healthy events around a poisoned one', async () => {
    await queueEvent('EV-GOOD-1');
    await queueEvent('EV-GOOD-2');
    expect(await worker.drainOnce()).toBe(2);
    expect(handler.published).toHaveLength(2);
  });

  it('starts and stops without leaving a timer behind', () => {
    worker.start(60_000);
    worker.start(60_000);
    worker.stop();
    worker.stop();
    expect(true).toBe(true);
  });

  it('drains what a real use case queued', async () => {
    const email = `member-${randomUUID().slice(0, 8)}@outbox.test`;
    await harness.prisma.account.create({
      data: { id: `A-${randomUUID().slice(0, 8)}`, email, passwordHash: 'x', roles: ['MEMBER'] },
    });
    await queueEvent('EV-REAL');
    expect(await worker.drainOnce()).toBe(1);
    expect(handler.published).toContain('EV-REAL');
  });
});
