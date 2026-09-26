import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CURRENCY } from '@checkout/shared/constants';

import { AppModule } from './app.module';
import type { AppConfig } from './config/app-config';
import { APP_CONFIG } from './config/config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const { port } = app.get<AppConfig>(APP_CONFIG).app;
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on port ${port} (currency ${CURRENCY})`);
}

void bootstrap();
