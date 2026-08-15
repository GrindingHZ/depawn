import { Module } from '@nestjs/common';
import { TestClockController } from './test-clock.controller';

/* Imported by AppModule only when NODE_ENV is test. Keeping the guard at the
   module boundary rather than inside a handler means the route is absent
   from the graph, not merely refused. */
@Module({
  controllers: [TestClockController],
})
export class TestSupportModule {}
