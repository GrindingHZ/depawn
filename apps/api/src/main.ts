import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { OutboxDrainWorker } from './infrastructure/events/outbox-drain.worker';
import { loadConfiguration } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  // The drain runs in the serving process only. Tests call drainOnce
  // directly so no timer outlives a suite.
  app.get(OutboxDrainWorker).start(5_000);
  await app.listen(loadConfiguration().httpPort);
}

void bootstrap();
