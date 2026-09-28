// The only webhook event type this spec acts on. Lives in domain/, not
// infrastructure/http, because HandlePaymentWebhookUseCase (application/)
// needs it and may not import an adapter (references/layering.md).
export const PAYMENT_EVENT_TRANSACTION_UPDATED = 'transaction.updated';
