import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CURRENCY } from '@checkout/shared/constants';

import { AppModule } from './app.module';

const PORT = 3000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  await app.listen(PORT);
  new Logger('Bootstrap').log(`API listening on port ${PORT} (currency ${CURRENCY})`);
}

void bootstrap();
