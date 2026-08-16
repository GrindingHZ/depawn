import { Global, Module } from '@nestjs/common';
import { SYSTEM_STATE_PORT } from '../../domain/ports/system-state.port';
import { DatabaseSystemStateAdapter } from './database-system-state.adapter';

/* Global because the pause check belongs at the entrance of use cases spread
   across several modules. */
@Global()
@Module({
  providers: [{ provide: SYSTEM_STATE_PORT, useClass: DatabaseSystemStateAdapter }],
  exports: [SYSTEM_STATE_PORT],
})
export class SystemStateModule {}
