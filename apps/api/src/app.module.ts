import { Module } from '@nestjs/common';

import { ConfigModule } from './config/config.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { LocationsModule } from './modules/locations/locations.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { HealthController } from './shared/infrastructure/http/health/health.controller';
import { LoggerModule } from './shared/infrastructure/logging/logger.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    CatalogModule,
    LocationsModule,
    PricingModule,
    CustomersModule,
    TransactionsModule,
    DeliveriesModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
