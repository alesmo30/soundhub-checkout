import { Module } from '@nestjs/common';

import type { ProductRepository } from '../catalog';
import { PRODUCT_REPOSITORY } from '../catalog';
import { CatalogModule } from '../catalog/catalog.module';
import type { CustomerRepository } from '../customers';
import { CUSTOMER_REPOSITORY } from '../customers';
import { CustomersModule } from '../customers/customers.module';
import type { DeliveryRepository } from '../deliveries';
import { DELIVERY_REPOSITORY } from '../deliveries';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import type { TransactionRepository } from '../transactions';
import { TRANSACTION_REPOSITORY } from '../transactions';
import { TransactionsModule } from '../transactions/transactions.module';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { UNIT_OF_WORK, type UnitOfWork } from '../../shared/application/ports/unit-of-work.port';
import { TypeOrmUnitOfWork } from '../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { EMAIL_SENDER } from './application/ports/email-sender.port';
import type { EmailSender } from './application/ports/email-sender.port';
import {
  SEND_TRANSACTION_EMAIL_DEPENDENCIES,
  SendTransactionEmailUseCase,
} from './application/use-cases/send-transaction-email.use-case';
import type { SendTransactionEmailDependencies } from './application/use-cases/send-transaction-email.use-case';
import { LoggingEmailSender } from './infrastructure/logging-email-sender';
import { NodemailerGmailAdapter } from './infrastructure/nodemailer-gmail.adapter';

// Intermediate DI seams, local to this module (same pattern as
// transactions.module.ts's FINALIZE_COLLABORATORS): each factory below
// bundles at most 3 collaborators, so no useFactory exceeds C1's
// 3-positional-parameter limit while still assembling the use case's
// single-token dependency object.
const NOTIFICATIONS_REPOSITORIES = Symbol('NOTIFICATIONS_REPOSITORIES');

interface NotificationsRepositories {
  readonly transactionRepository: TransactionRepository;
  readonly customerRepository: CustomerRepository;
  readonly productRepository: ProductRepository;
}

const NOTIFICATIONS_RUNTIME = Symbol('NOTIFICATIONS_RUNTIME');

interface NotificationsRuntime {
  readonly deliveryRepository: DeliveryRepository;
  readonly emailSender: EmailSender;
  readonly unitOfWork: UnitOfWork;
}

// A plain function, not a factory closure, so the driver selection is unit
// tested directly (see notifications.module.spec.ts) without spinning up
// the whole module and its real TypeORM-backed imports.
export function selectEmailSender(appConfig: AppConfig): EmailSender {
  return appConfig.email.driver === 'smtp'
    ? new NodemailerGmailAdapter(appConfig)
    : new LoggingEmailSender();
}

@Module({
  imports: [TransactionsModule, CustomersModule, CatalogModule, DeliveriesModule],
  providers: [
    { provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
    { provide: EMAIL_SENDER, useFactory: selectEmailSender, inject: [APP_CONFIG] },
    {
      provide: NOTIFICATIONS_REPOSITORIES,
      useFactory: (
        transactionRepository: TransactionRepository,
        customerRepository: CustomerRepository,
        productRepository: ProductRepository,
      ): NotificationsRepositories => ({
        transactionRepository,
        customerRepository,
        productRepository,
      }),
      inject: [TRANSACTION_REPOSITORY, CUSTOMER_REPOSITORY, PRODUCT_REPOSITORY],
    },
    {
      provide: NOTIFICATIONS_RUNTIME,
      useFactory: (
        deliveryRepository: DeliveryRepository,
        emailSender: EmailSender,
        unitOfWork: UnitOfWork,
      ): NotificationsRuntime => ({ deliveryRepository, emailSender, unitOfWork }),
      inject: [DELIVERY_REPOSITORY, EMAIL_SENDER, UNIT_OF_WORK],
    },
    {
      provide: SEND_TRANSACTION_EMAIL_DEPENDENCIES,
      useFactory: (
        repositories: NotificationsRepositories,
        runtime: NotificationsRuntime,
        appConfig: AppConfig,
      ): SendTransactionEmailDependencies => ({
        ...repositories,
        ...runtime,
        publicWebUrl: appConfig.web.publicUrl,
      }),
      inject: [NOTIFICATIONS_REPOSITORIES, NOTIFICATIONS_RUNTIME, APP_CONFIG],
    },
    SendTransactionEmailUseCase,
  ],
  exports: [SendTransactionEmailUseCase],
})
export class NotificationsModule {}
