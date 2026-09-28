import type { GetQuoteUseCase } from '../../../pricing';
import type { CustomerRepository } from '../../../customers';
import type { DeliveryRepository } from '../../../deliveries';
import type { Clock } from '../../../../shared/application/ports/clock.port';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import type { FinalizeTransactionUseCase } from '../use-cases/finalize-transaction.use-case';
import type { PaymentGatewayPort } from './payment-gateway.port';
import type { StockReservationPort } from './stock-reservation.port';
import type { TransactionRepository } from './transaction.repository.port';

// Bundles CreateTransactionUseCase's collaborators behind one DI token so
// its constructor stays at 1 positional parameter (see
// references/coding-conventions.md#c1 — same pattern as pricing's
// GetQuoteDependencies and this module's own FinalizeTransactionDependencies).
// transactions.module.ts (step 12) builds this object from the individually
// wired TRANSACTION_REPOSITORY, DELIVERY_REPOSITORY, CUSTOMER_REPOSITORY,
// PAYMENT_GATEWAY, STOCK_RESERVATION, UNIT_OF_WORK and CLOCK providers, plus
// PricingModule's GetQuoteUseCase and this module's own
// FinalizeTransactionUseCase.
export const CREATE_TRANSACTION_DEPENDENCIES = Symbol('CREATE_TRANSACTION_DEPENDENCIES');

export interface CreateTransactionDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly deliveryRepository: DeliveryRepository;
  readonly customerRepository: CustomerRepository;
  readonly paymentGateway: PaymentGatewayPort;
  readonly getQuoteUseCase: GetQuoteUseCase;
  readonly stockReservation: StockReservationPort;
  readonly unitOfWork: UnitOfWork;
  readonly clock: Clock;
  readonly finalizeTransactionUseCase: FinalizeTransactionUseCase;
  // No dedicated Random port exists in this codebase; the precedent
  // (shared/infrastructure/resilience/retry-with-backoff.ts's `random =
  // Math.random` default parameter) is a plain injected function, not a
  // port. transactions.module.ts (step 12) wires this to `Math.random`;
  // tests inject a deterministic sequence.
  readonly random: () => number;
}
