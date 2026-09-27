import { CardBrand } from '@checkout/shared/enums';
import type { CardFormValues } from '@checkout/shared/validation';

import { env } from '@/config/env';
import type { CardSummary } from '@/features/checkout';

// Both functions are plain `fetch` calls, never RTK Query mutations: RTK
// Query stores a mutation's `originalArgs` in Redux state and its actions,
// which would put the card number and CVC in Redux. See
// docs/design decisions in specs/07-web-checkout.md#gateway.
const HTTP_SERVER_ERROR_STATUS = 500;

export interface AcceptanceTerms {
  acceptanceToken: string;
  termsUrl: string;
  personalDataAuthToken: string;
  personalDataUrl: string;
}

export type TokenizeResult =
  { ok: true; card: CardSummary } | { ok: false; reason: 'INVALID_CARD' | 'UNAVAILABLE' };

interface PresignedAcceptance {
  acceptance_token: string;
  permalink: string;
}

interface MerchantResponseBody {
  data: {
    presigned_acceptance: PresignedAcceptance;
    presigned_personal_data_auth: PresignedAcceptance;
  };
}

interface TokenizeCardRequestBody {
  number: string;
  cvc: string;
  exp_month: string;
  exp_year: string;
  card_holder: string;
}

interface TokenizeCardResponseBody {
  data: {
    id: string;
    brand: string;
    last_four: string;
  };
}

export async function fetchAcceptanceTokens(): Promise<AcceptanceTerms> {
  const response = await fetch(`${env.paymentGatewayUrl}/merchants/${env.paymentGatewayPublicKey}`);

  if (!response.ok) {
    throw new Error('Failed to fetch acceptance tokens');
  }

  const body = (await response.json()) as MerchantResponseBody;

  return {
    acceptanceToken: body.data.presigned_acceptance.acceptance_token,
    termsUrl: body.data.presigned_acceptance.permalink,
    personalDataAuthToken: body.data.presigned_personal_data_auth.acceptance_token,
    personalDataUrl: body.data.presigned_personal_data_auth.permalink,
  };
}

function mapBrand(brand: string): CardBrand | null {
  if (brand === CardBrand.VISA || brand === CardBrand.MASTERCARD) {
    return brand;
  }

  return null;
}

interface CardExpiry {
  expMonth: string;
  expYear: string;
}

function splitExpiry(expiry: string): CardExpiry {
  const [expMonth = '', expYear = ''] = expiry.split('/');

  return { expMonth, expYear };
}

function buildTokenizeCardBody(card: CardFormValues): TokenizeCardRequestBody {
  const { expMonth, expYear } = splitExpiry(card.expiry);

  return {
    number: card.number,
    cvc: card.cvc,
    exp_month: expMonth,
    exp_year: expYear,
    card_holder: card.holder,
  };
}

export async function tokenizeCard(card: CardFormValues): Promise<TokenizeResult> {
  let response: Response;

  try {
    response = await fetch(`${env.paymentGatewayUrl}/tokens/cards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.paymentGatewayPublicKey}`,
      },
      body: JSON.stringify(buildTokenizeCardBody(card)),
    });
  } catch {
    // Network failure never carries the request body in the message.
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  if (response.status >= HTTP_SERVER_ERROR_STATUS) {
    return { ok: false, reason: 'UNAVAILABLE' };
  }

  if (!response.ok) {
    return { ok: false, reason: 'INVALID_CARD' };
  }

  const body = (await response.json()) as TokenizeCardResponseBody;
  const brand = mapBrand(body.data.brand);

  if (brand === null) {
    return { ok: false, reason: 'INVALID_CARD' };
  }

  return {
    ok: true,
    card: { token: body.data.id, brand, last4: body.data.last_four },
  };
}
