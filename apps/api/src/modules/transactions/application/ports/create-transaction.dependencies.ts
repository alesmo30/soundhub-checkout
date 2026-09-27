import type { GetQuoteUseCase } from '../../../pricing';
import type { CustomerRepository } from '../../../customers';
import type { DeliveryRepository } from '../../../deliveries';
import type { PaymentGatewayPort } from './payment-gateway.port';
import type { TransactionRepository } from './transaction.repository.port';

// Bundles CreateTransactionUseCase's collaborators behind one DI token so
// its constructor stays at 1 positional parameter (see
// references/coding-conventions.md#c1 — same pattern as pricing's
// GetQuoteDependencies and this module's own FinalizeTransactionDependencies).
// transactions.module.ts (step 12) builds this object from the individually
// wired TRANSACTION_REPOSITORY, DELIVERY_REPOSITORY, CUSTOMER_REPOSITORY and
// PAYMENT_GATEWAY providers plus PricingModule's GetQuoteUseCase provider.
// Step 11 is expected to grow this interface (stock reservation, unit of
// work, clock) once reserve/charge stop being stubs.
export const CREATE_TRANSACTION_DEPENDENCIES = Symbol('CREATE_TRANSACTION_DEPENDENCIES');

export interface CreateTransactionDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly deliveryRepository: DeliveryRepository;
  readonly customerRepository: CustomerRepository;
  readonly paymentGateway: PaymentGatewayPort;
  readonly getQuoteUseCase: GetQuoteUseCase;
}
