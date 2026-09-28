import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CatalogModule } from '../catalog/catalog.module';
import type { CustomerRepository } from '../customers';
import { CUSTOMER_REPOSITORY } from '../customers';
import { CustomersModule } from '../customers/customers.module';
import type { DeliveryRepository } from '../deliveries';
import { DELIVERY_REPOSITORY } from '../deliveries';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { GetQuoteUseCase } from '../pricing';
import { PricingModule } from '../pricing/pricing.module';
import type { Clock } from '../../shared/application/ports/clock.port';
import { CLOCK } from '../../shared/application/ports/clock.port';
import { EVENT_PUBLISHER } from '../../shared/application/ports/event-publisher.port';
import type { UnitOfWork } from '../../shared/application/ports/unit-of-work.port';
import { UNIT_OF_WORK } from '../../shared/application/ports/unit-of-work.port';
import { InMemoryEventPublisher } from '../../shared/infrastructure/messaging/in-memory-event-publisher';
import { TypeOrmUnitOfWork } from '../../shared/infrastructure/persistence/typeorm-unit-of-work';
import { SystemClock } from '../../shared/infrastructure/time/system-clock';
import { CREATE_TRANSACTION_DEPENDENCIES } from './application/ports/create-transaction.dependencies';
import type { CreateTransactionDependencies } from './application/ports/create-transaction.dependencies';
import type { PaymentGatewayPort } from './application/ports/payment-gateway.port';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import type { StockReservationPort } from './application/ports/stock-reservation.port';
import { STOCK_RESERVATION } from './application/ports/stock-reservation.port';
import type { TransactionRepository } from './application/ports/transaction.repository.port';
import { TRANSACTION_REPOSITORY } from './application/ports/transaction.repository.port';
import { CreateTransactionUseCase } from './application/use-cases/create-transaction.use-case';
import type { FinalizeTransactionDependencies } from './application/use-cases/finalize-transaction.use-case';
import {
  FINALIZE_TRANSACTION_DEPENDENCIES,
  FinalizeTransactionUseCase,
} from './application/use-cases/finalize-transaction.use-case';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { IdempotencyKeyPipe } from './infrastructure/http/idempotency-key.pipe';
import { HttpPaymentGatewayAdapter } from './infrastructure/payment-gateway/http-payment-gateway.adapter';
import { TransactionOrmEntity } from './infrastructure/persistence/transaction.orm-entity';
import { TypeOrmTransactionRepository } from './infrastructure/persistence/typeorm-transaction.repository';

// Intermediate DI seams, local to this module (same pattern as
// pricing.module.ts's QUOTE_REPOSITORIES): each factory below bundles at
// most 3 collaborators, so no useFactory exceeds C1's 3-positional-parameter
// limit while still assembling the two use cases' single-token dependency
// objects.
const FINALIZE_COLLABORATORS = Symbol('FINALIZE_COLLABORATORS');

interface FinalizeCollaborators {
  readonly transactionRepository: TransactionRepository;
  readonly stockReservation: StockReservationPort;
  readonly deliveryRepository: DeliveryRepository;
}

const CREATE_TRANSACTION_REPOSITORIES = Symbol('CREATE_TRANSACTION_REPOSITORIES');

interface CreateTransactionRepositories {
  readonly transactionRepository: TransactionRepository;
  readonly deliveryRepository: DeliveryRepository;
  readonly customerRepository: CustomerRepository;
}

const CREATE_TRANSACTION_SERVICES = Symbol('CREATE_TRANSACTION_SERVICES');

interface CreateTransactionServices {
  readonly paymentGateway: PaymentGatewayPort;
  readonly getQuoteUseCase: GetQuoteUseCase;
  readonly stockReservation: StockReservationPort;
}

const CREATE_TRANSACTION_RUNTIME = Symbol('CREATE_TRANSACTION_RUNTIME');

interface CreateTransactionRuntime {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionOrmEntity]),
    CatalogModule,
    PricingModule,
    CustomersModule,
    DeliveriesModule,
  ],
  controllers: [TransactionsController],
  providers: [
    { provide: TRANSACTION_REPOSITORY, useClass: TypeOrmTransactionRepository },
    { provide: PAYMENT_GATEWAY, useClass: HttpPaymentGatewayAdapter },
    { provide: UNIT_OF_WORK, useClass: TypeOrmUnitOfWork },
    { provide: CLOCK, useClass: SystemClock },
    { provide: EVENT_PUBLISHER, useClass: InMemoryEventPublisher },
    {
      provide: FINALIZE_COLLABORATORS,
      useFactory: (
        transactionRepository: TransactionRepository,
        stockReservation: StockReservationPort,
        deliveryRepository: DeliveryRepository,
      ): FinalizeCollaborators => ({
        transactionRepository,
        stockReservation,
        deliveryRepository,
      }),
      inject: [TRANSACTION_REPOSITORY, STOCK_RESERVATION, DELIVERY_REPOSITORY],
    },
    {
      provide: FINALIZE_TRANSACTION_DEPENDENCIES,
      useFactory: (
        collaborators: FinalizeCollaborators,
        unitOfWork: UnitOfWork,
      ): FinalizeTransactionDependencies => ({ ...collaborators, unitOfWork }),
      inject: [FINALIZE_COLLABORATORS, UNIT_OF_WORK],
    },
    FinalizeTransactionUseCase,
    {
      provide: CREATE_TRANSACTION_REPOSITORIES,
      useFactory: (
        transactionRepository: TransactionRepository,
        deliveryRepository: DeliveryRepository,
        customerRepository: CustomerRepository,
      ): CreateTransactionRepositories => ({
        transactionRepository,
        deliveryRepository,
        customerRepository,
      }),
      inject: [TRANSACTION_REPOSITORY, DELIVERY_REPOSITORY, CUSTOMER_REPOSITORY],
    },
    {
      provide: CREATE_TRANSACTION_SERVICES,
      useFactory: (
        paymentGateway: PaymentGatewayPort,
        getQuoteUseCase: GetQuoteUseCase,
        stockReservation: StockReservationPort,
      ): CreateTransactionServices => ({ paymentGateway, getQuoteUseCase, stockReservation }),
      inject: [PAYMENT_GATEWAY, GetQuoteUseCase, STOCK_RESERVATION],
    },
    {
      provide: CREATE_TRANSACTION_RUNTIME,
      useFactory: (
        unitOfWork: UnitOfWork,
        clock: Clock,
        finalizeTransactionUseCase: FinalizeTransactionUseCase,
      ): CreateTransactionRuntime => ({ unitOfWork, clock, finalizeTransactionUseCase }),
      inject: [UNIT_OF_WORK, CLOCK, FinalizeTransactionUseCase],
    },
    {
      provide: CREATE_TRANSACTION_DEPENDENCIES,
      useFactory: (
        repositories: CreateTransactionRepositories,
        services: CreateTransactionServices,
        runtime: CreateTransactionRuntime,
      ): CreateTransactionDependencies => ({
        ...repositories,
        ...services,
        ...runtime,
        random: () => Math.random(),
      }),
      inject: [
        CREATE_TRANSACTION_REPOSITORIES,
        CREATE_TRANSACTION_SERVICES,
        CREATE_TRANSACTION_RUNTIME,
      ],
    },
    CreateTransactionUseCase,
    IdempotencyKeyPipe,
  ],
})
export class TransactionsModule {}
