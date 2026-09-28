import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type {
  CreateTransactionRequest,
  DeliveryInput,
  PaymentInput,
  Quote,
  UpsertCustomerRequest,
} from '@checkout/shared/contracts';

import { useAppDispatch, useAppStore } from '@/app/hooks';
import { invalidateProduct } from '@/features/catalog';
import { api } from '@/services/api';

import type { AcceptanceTokens, CardSummary } from '../checkout-session.slice';
import {
  ensureIdempotencyKey,
  rotateIdempotencyKey,
  selectAcceptance,
  selectCard,
  selectIdempotencyKey,
  selectInstallments,
  setContactFieldError,
  setPaymentProblem,
} from '../checkout-session.slice';
import { selectContactDetails } from '../checkout.selectors';
import {
  closeCheckout,
  goToStep,
  selectCheckoutProductId,
  selectQuantityFor,
} from '../checkout.slice';
import { useCreateTransactionMutation, useUpsertCustomerMutation } from '../checkout.api';
import type { ContactDetails } from '../lib/contact-details';
import { toDeliveryValues } from '../lib/contact-details';
import { mapErrorToOutcome } from '../lib/payment-outcome';
import {
  clearPendingPayment,
  readPendingPayment,
  writePendingPayment,
} from '../lib/pending-payment';

export interface UseCheckoutFlowResult {
  isPaying: boolean;
  // Takes the summary's freshly-fetched quote so `expectedTotalInCents`
  // never comes from local math (see specs/11-web-payment.md#scope).
  pay: (quote: Quote) => Promise<void>;
  // Re-sends whatever is in the pending entry, unchanged, after an
  // uncertain failure.
  retry: () => Promise<void>;
}

function toCustomerBody(contact: ContactDetails): UpsertCustomerRequest {
  return contact.customer;
}

// DeliveryFormValues carries departmentCode for the form's own cascading
// selects; the transaction contract has no such field.
function toDeliveryInput(contact: ContactDetails): DeliveryInput {
  const values = toDeliveryValues(contact);

  return {
    recipientName: values.recipientName,
    phone: values.phone,
    addressLine: values.addressLine,
    addressDetail: values.addressDetail,
    municipalityCode: values.municipalityCode,
  };
}

interface BuildTransactionBodyParams {
  customerId: string;
  productId: string;
  quantity: number;
  installments: number;
  expectedTotalInCents: number;
  card: CardSummary;
  acceptance: AcceptanceTokens;
  contact: ContactDetails;
}

function buildTransactionBody(params: BuildTransactionBodyParams): CreateTransactionRequest {
  const payment: PaymentInput = {
    cardToken: params.card.token,
    cardBrand: params.card.brand,
    cardLast4: params.card.last4,
    acceptanceToken: params.acceptance.acceptanceToken,
    personalAuthToken: params.acceptance.personalDataAuthToken,
  };

  return {
    customerId: params.customerId,
    productId: params.productId,
    quantity: params.quantity,
    installments: params.installments,
    expectedTotalInCents: params.expectedTotalInCents,
    payment,
    delivery: toDeliveryInput(params.contact),
  };
}

// Orchestrates "Pagar" and "Reintentar" per the outcome table in
// specs/11-web-payment.md#outcome-table. The card number and CVC never
// reach this hook: `card` only ever holds the already-tokenized summary
// saved by use-card-tokenization (see references/data-integrity.md#sensitive-data).
export function useCheckoutFlow(): UseCheckoutFlowResult {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const navigate = useNavigate();
  const [upsertCustomer] = useUpsertCustomerMutation();
  const [createTransaction] = useCreateTransactionMutation();

  // A ref, not just state: two synchronous clicks must see the same
  // "in flight" value before React re-renders with the new state.
  const isPayingRef = useRef(false);
  const [isPaying, setIsPaying] = useState(false);

  function applyTransactionOutcome(error: unknown, body: CreateTransactionRequest): void {
    const outcome = mapErrorToOutcome(error);

    if (outcome.pending === 'CLEAR') {
      clearPendingPayment();
    }

    if (outcome.key === 'ROTATE') {
      dispatch(rotateIdempotencyKey());
    }

    switch (outcome.kind) {
      case 'PRICE_CHANGED':
        dispatch(api.util.invalidateTags([{ type: 'Quote' }]));
        dispatch(
          setPaymentProblem({
            kind: 'PRICE_CHANGED',
            previousTotalInCents: body.expectedTotalInCents,
          }),
        );
        return;
      case 'OUT_OF_STOCK':
        dispatch(invalidateProduct(body.productId));
        dispatch(setPaymentProblem({ kind: 'OUT_OF_STOCK' }));
        return;
      case 'UNAVAILABLE':
        dispatch(setPaymentProblem({ kind: 'UNAVAILABLE' }));
        return;
      case 'RATE_LIMITED':
        dispatch(setPaymentProblem({ kind: 'RATE_LIMITED' }));
        return;
      case 'UNCERTAIN':
        dispatch(setPaymentProblem({ kind: 'UNCERTAIN' }));
        return;
      // EMAIL_ALREADY_REGISTERED / CUSTOMER_DATA_MISMATCH are POST /customers
      // codes; createTransaction never returns them, but the mapping is
      // shared, so fall back to the generic failure copy just in case.
      case 'EMAIL_ALREADY_REGISTERED':
      case 'CUSTOMER_DATA_MISMATCH':
      case 'FAILED':
        dispatch(setPaymentProblem({ kind: 'FAILED' }));
    }
  }

  function applyCustomerOutcome(error: unknown): void {
    const outcome = mapErrorToOutcome(error);

    if (outcome.key === 'ROTATE') {
      dispatch(rotateIdempotencyKey());
    }

    if (outcome.kind === 'EMAIL_ALREADY_REGISTERED' || outcome.kind === 'CUSTOMER_DATA_MISMATCH') {
      dispatch(setContactFieldError({ field: 'email', code: outcome.kind }));
      dispatch(goToStep('CONTACT'));
      return;
    }

    // No pending entry exists yet at this point (see pay()): only the
    // problem kind matters, and an uncertain customer-upsert failure is as
    // uncertain as an uncertain transaction one.
    dispatch(setPaymentProblem({ kind: outcome.kind === 'UNCERTAIN' ? 'UNCERTAIN' : 'FAILED' }));
  }

  async function sendTransaction(
    idempotencyKey: string,
    body: CreateTransactionRequest,
  ): Promise<void> {
    writePendingPayment({ idempotencyKey, body, savedAt: new Date().toISOString() });

    try {
      const { transaction } = await createTransaction({ idempotencyKey, body }).unwrap();

      clearPendingPayment();
      dispatch(closeCheckout());
      void navigate(`/transactions/${transaction.id}`);
    } catch (error) {
      applyTransactionOutcome(error, body);
    }
  }

  async function pay(quote: Quote): Promise<void> {
    if (isPayingRef.current) {
      return;
    }

    const state = store.getState();
    const productId = selectCheckoutProductId(state);
    const contact = selectContactDetails(state);
    const card = selectCard(state);
    const acceptance = selectAcceptance(state);

    // The UI only enables "Pagar" once all of these exist; a hook caller
    // that got here without them has nothing sane to send.
    if (!productId || !contact || !card || !acceptance) {
      return;
    }

    const quantity = selectQuantityFor(state, productId);
    const installments = selectInstallments(state);

    isPayingRef.current = true;
    setIsPaying(true);

    try {
      dispatch(ensureIdempotencyKey());
      const idempotencyKey = selectIdempotencyKey(store.getState());

      if (!idempotencyKey) {
        return;
      }

      let customerId: string;

      try {
        const customer = await upsertCustomer(toCustomerBody(contact)).unwrap();
        customerId = customer.id;
      } catch (error) {
        applyCustomerOutcome(error);
        return;
      }

      const body = buildTransactionBody({
        customerId,
        productId,
        quantity,
        installments,
        expectedTotalInCents: quote.totalInCents,
        card,
        acceptance,
        contact,
      });

      await sendTransaction(idempotencyKey, body);
    } finally {
      isPayingRef.current = false;
      setIsPaying(false);
    }
  }

  async function retry(): Promise<void> {
    if (isPayingRef.current) {
      return;
    }

    const entry = readPendingPayment();

    if (!entry) {
      return;
    }

    isPayingRef.current = true;
    setIsPaying(true);

    try {
      await sendTransaction(entry.idempotencyKey, entry.body);
    } finally {
      isPayingRef.current = false;
      setIsPaying(false);
    }
  }

  return { isPaying, pay, retry };
}
