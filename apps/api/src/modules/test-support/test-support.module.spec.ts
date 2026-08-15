import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* The guard is the module import in app.module.ts, so the property under
   test is that the graph reads NODE_ENV, not that a handler refuses. A
   deployed process must not be able to move its own clock. */
describe('test support mounting', () => {
  it('is imported by the application graph only under test', async () => {
    const source = await readFile(path.resolve(__dirname, '../../app.module.ts'), 'utf8');
    expect(source).toContain("process.env.NODE_ENV === 'test' ? [TestSupportModule] : []");
    expect(source).toContain('...testOnlyModules');
  });

  it('exposes no route of its own outside the clock namespace', async () => {
    const { TestClockController } = await import('./test-clock.controller');
    const { TestSupportModule } = await import('./test-support.module');
    const controllers: unknown = Reflect.getMetadata('controllers', TestSupportModule);
    expect(controllers).toEqual([TestClockController]);
  });
});
