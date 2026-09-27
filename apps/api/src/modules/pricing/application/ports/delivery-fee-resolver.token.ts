// DI seam for the DeliveryFeeResolver built in pricing.module.ts, so a
// future use case (e.g. api 04.1's CreateTransactionUseCase) can inject the
// same configured instance instead of rebuilding the strategy list.
export const DELIVERY_FEE_RESOLVER = Symbol('DELIVERY_FEE_RESOLVER');
