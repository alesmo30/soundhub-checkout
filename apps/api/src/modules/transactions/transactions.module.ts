import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { ProductRepository } from '../catalog';
import { PRODUCT_REPOSITORY } from '../catalog';
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
import type { EventPublisher } from '../../shared/application/ports/event-publisher.port';
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
import type { GetTransactionStatusDependencies } from './application/use-cases/get-transaction-status.use-case';
import {
  GET_TRANSACTION_STATUS_DEPENDENCIES,
  GetTransactionStatusUseCase,
} from './application/use-cases/get-transaction-status.use-case';
import type { HandlePaymentWebhookDependencies } from './application/use-cases/handle-payment-webhook.use-case';
import {
  HANDLE_PAYMENT_WEBHOOK_DEPENDENCIES,
  HandlePaymentWebhookUseCase,
} from './application/use-cases/handle-payment-webhook.use-case';
import type { ReconcileTransactionsDependencies } from './application/use-cases/reconcile-transactions.use-case';
import {
  RECONCILE_TRANSACTIONS_DEPENDENCIES,
  ReconcileTransactionsUseCase,
} from './application/use-cases/reconcile-transactions.use-case';
import { TransactionsController } from './infrastructure/http/transactions.controller';
import { PaymentWebhookController } from './infrastructure/http/payment-webhook.controller';
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

const FINALIZE_RUNTIME = Symbol('FINALIZE_RUNTIME');

interface FinalizeRuntime {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly eventPublisher: EventPublisher;
}

const GET_STATUS_REPOSITORIES = Symbol('GET_STATUS_REPOSITORIES');

interface GetStatusRepositories {
  readonly transactionRepository: TransactionRepository;
  readonly productRepository: ProductRepository;
  readonly deliveryRepository: DeliveryRepository;
}

const GET_STATUS_SERVICES = Symbol('GET_STATUS_SERVICES');

interface GetStatusServices {
  readonly paymentGateway: PaymentGatewayPort;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
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

const RECONCILE_COLLABORATORS = Symbol('RECONCILE_COLLABORATORS');

interface ReconcileCollaborators {
  readonly transactionRepository: TransactionRepository;
  readonly paymentGateway: PaymentGatewayPort;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
}

const RECONCILE_RUNTIME = Symbol('RECONCILE_RUNTIME');

interface ReconcileRuntime {
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly eventPublisher: EventPublisher;
}

@Module({
  imports: [
    TypeOrmModule.forFeature([TransactionOrmEntity]),
    CatalogModule,
    PricingModule,
    CustomersModule,
    DeliveriesModule,
  ],
  controllers: [TransactionsController, PaymentWebhookController],
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
      provide: FINALIZE_RUNTIME,
      useFactory: (
        unitOfWork: UnitOfWork,
        clock: Clock,
        eventPublisher: EventPublisher,
      ): FinalizeRuntime => ({ unitOfWork, clock, eventPublisher }),
      inject: [UNIT_OF_WORK, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: FINALIZE_TRANSACTION_DEPENDENCIES,
      useFactory: (
        collaborators: FinalizeCollaborators,
        runtime: FinalizeRuntime,
      ): FinalizeTransactionDependencies => ({ ...collaborators, ...runtime }),
      inject: [FINALIZE_COLLABORATORS, FINALIZE_RUNTIME],
    },
    FinalizeTransactionUseCase,
    {
      provide: GET_STATUS_REPOSITORIES,
      useFactory: (
        transactionRepository: TransactionRepository,
        productRepository: ProductRepository,
        deliveryRepository: DeliveryRepository,
      ): GetStatusRepositories => ({
        transactionRepository,
        productRepository,
        deliveryRepository,
      }),
      inject: [TRANSACTION_REPOSITORY, PRODUCT_REPOSITORY, DELIVERY_REPOSITORY],
    },
    {
      provide: GET_STATUS_SERVICES,
      useFactory: (
        paymentGateway: PaymentGatewayPort,
        finalizeTransactionUseCase: FinalizeTransactionUseCase,
      ): GetStatusServices => ({ paymentGateway, finalizeTransactionUseCase }),
      inject: [PAYMENT_GATEWAY, FinalizeTransactionUseCase],
    },
    {
      provide: GET_TRANSACTION_STATUS_DEPENDENCIES,
      useFactory: (
        repositories: GetStatusRepositories,
        services: GetStatusServices,
      ): GetTransactionStatusDependencies => ({ ...repositories, ...services }),
      inject: [GET_STATUS_REPOSITORIES, GET_STATUS_SERVICES],
    },
    GetTransactionStatusUseCase,
    {
      provide: HANDLE_PAYMENT_WEBHOOK_DEPENDENCIES,
      useFactory: (
        transactionRepository: TransactionRepository,
        finalizeTransactionUseCase: FinalizeTransactionUseCase,
      ): HandlePaymentWebhookDependencies => ({
        transactionRepository,
        finalizeTransactionUseCase,
      }),
      inject: [TRANSACTION_REPOSITORY, FinalizeTransactionUseCase],
    },
    HandlePaymentWebhookUseCase,
    {
      provide: RECONCILE_COLLABORATORS,
      useFactory: (
        transactionRepository: TransactionRepository,
        paymentGateway: PaymentGatewayPort,
        finalizeTransactionUseCase: FinalizeTransactionUseCase,
      ): ReconcileCollaborators => ({
        transactionRepository,
        paymentGateway,
        finalizeTransactionUseCase,
      }),
      inject: [TRANSACTION_REPOSITORY, PAYMENT_GATEWAY, FinalizeTransactionUseCase],
    },
    {
      provide: RECONCILE_RUNTIME,
      useFactory: (
        unitOfWork: UnitOfWork,
        clock: Clock,
        eventPublisher: EventPublisher,
      ): ReconcileRuntime => ({ unitOfWork, clock, eventPublisher }),
      inject: [UNIT_OF_WORK, CLOCK, EVENT_PUBLISHER],
    },
    {
      provide: RECONCILE_TRANSACTIONS_DEPENDENCIES,
      useFactory: (
        collaborators: ReconcileCollaborators,
        runtime: ReconcileRuntime,
      ): ReconcileTransactionsDependencies => ({ ...collaborators, ...runtime }),
      inject: [RECONCILE_COLLABORATORS, RECONCILE_RUNTIME],
    },
    ReconcileTransactionsUseCase,
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
