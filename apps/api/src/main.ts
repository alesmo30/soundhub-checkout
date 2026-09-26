import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CURRENCY } from '@checkout/shared/constants';
import { Logger as PinoLogger } from 'nestjs-pino';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app-config';
import { APP_CONFIG } from './config/config.module';
import { configureApp } from './shared/infrastructure/http/configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false, bufferLogs: true });
  app.useLogger(app.get(PinoLogger));
  configureApp(app);

  const { port } = app.get<AppConfig>(APP_CONFIG).app;
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on port ${port} (currency ${CURRENCY})`);
}

void bootstrap();
