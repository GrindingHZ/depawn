import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The guard is the module import in app.module.ts, so the property under
   test is that the graph reads the runtime mode, not that a handler refuses.
   A deployed process must not be able to move its own clock. */
describe('test support mounting', () => {
  it('is imported by the application graph only under test or in a demo', async () => {
    const source = await readFile(path.resolve(__dirname, '../../app.module.ts'), 'utf8');
    expect(source).toContain('hasAdvanceableClock() ? [TestSupportModule] : []');
    expect(source).toContain('...testOnlyModules');
  });

  it('leaves the clock unmovable when neither test nor demo mode is set', async () => {
    const { hasAdvanceableClock } = await import('../../config/runtime-mode');
    const previousNodeEnvironment = process.env.NODE_ENV;
    const previousDemoMode = process.env.DEMO_MODE;
    process.env.NODE_ENV = 'production';
    delete process.env.DEMO_MODE;
    try {
      expect(hasAdvanceableClock()).toBe(false);
      process.env.DEMO_MODE = 'true';
      expect(hasAdvanceableClock()).toBe(true);
      // Only the exact string opts in, so a stray value cannot arm a
      // deployed process by accident.
      process.env.DEMO_MODE = '1';
      expect(hasAdvanceableClock()).toBe(false);
    } finally {
      process.env.NODE_ENV = previousNodeEnvironment;
      if (previousDemoMode === undefined) {
        delete process.env.DEMO_MODE;
      } else {
        process.env.DEMO_MODE = previousDemoMode;
      }
    }
  });

  it('exposes no route of its own outside the clock namespace', async () => {
    const { TestClockController } = await import('./test-clock.controller');
    const { TestSupportModule } = await import('./test-support.module');
    const controllers: unknown = Reflect.getMetadata('controllers', TestSupportModule);
    expect(controllers).toEqual([TestClockController]);
  });
});
