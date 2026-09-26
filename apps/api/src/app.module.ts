import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { LoggerModule } from './shared/infrastructure/logging/logger.module';

@Module({
  imports: [ConfigModule, LoggerModule],
})
export class AppModule {}
