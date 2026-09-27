import { useState } from 'react';
import type { CardFormValues } from '@checkout/shared/validation';

import { useAppDispatch } from '@/app/hooks';
import { tokenizeCard, type TokenizeResult } from '@/services/payment-gateway';

import { saveCard } from '../checkout-session.slice';
import { goToStep } from '../checkout.slice';
import { useGetAcceptanceTokensQuery } from '../checkout.api';

export type GatewayErrorReason = Extract<TokenizeResult, { ok: false }>['reason'];

export interface UseCardTokenizationResult {
  isTermsLoading: boolean;
  isTermsError: boolean;
  refetchTerms: () => void;
  termsUrl: string | undefined;
  personalDataUrl: string | undefined;
  acceptedTerms: boolean;
  setAcceptedTerms: (checked: boolean) => void;
  acceptedPersonalData: boolean;
  setAcceptedPersonalData: (checked: boolean) => void;
  isTokenizing: boolean;
  gatewayError: GatewayErrorReason | null;
  canSubmit: boolean;
  submit: (card: CardFormValues) => Promise<void>;
}

// Card tokenization, the legal checkboxes and the acceptance terms fetch all
// live here so `card-form.tsx` stays a renderer (see references/coding-
// conventions.md#c3). `tokenizeCard` is called directly, never through RTK
// Query: see specs/07-web-checkout.md#decisions, Gateway.
export function useCardTokenization(): UseCardTokenizationResult {
  const dispatch = useAppDispatch();
  const {
    data: terms,
    isLoading: isTermsLoading,
    isError: isTermsError,
    refetch,
  } = useGetAcceptanceTokensQuery(undefined, { refetchOnMountOrArgChange: true });

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPersonalData, setAcceptedPersonalData] = useState(false);
  const [isTokenizing, setIsTokenizing] = useState(false);
  const [gatewayError, setGatewayError] = useState<GatewayErrorReason | null>(null);

  async function submit(card: CardFormValues) {
    if (!terms) {
      return;
    }

    setGatewayError(null);
    setIsTokenizing(true);
    const result = await tokenizeCard(card);
    setIsTokenizing(false);

    if (!result.ok) {
      setGatewayError(result.reason);
      return;
    }

    dispatch(
      saveCard({
        card: result.card,
        installments: card.installments,
        acceptance: {
          acceptanceToken: terms.acceptanceToken,
          personalDataAuthToken: terms.personalDataAuthToken,
        },
      }),
    );
    dispatch(goToStep('SUMMARY'));
  }

  return {
    isTermsLoading,
    isTermsError,
    refetchTerms: () => void refetch(),
    termsUrl: terms?.termsUrl,
    personalDataUrl: terms?.personalDataUrl,
    acceptedTerms,
    setAcceptedTerms,
    acceptedPersonalData,
    setAcceptedPersonalData,
    isTokenizing,
    gatewayError,
    canSubmit: acceptedTerms && acceptedPersonalData && terms !== undefined,
    submit,
  };
}
