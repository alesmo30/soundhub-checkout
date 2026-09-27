import { useAppSelector } from '@/app/hooks';

import { selectCard } from '../checkout-session.slice';
import { selectContactDetails } from '../checkout.selectors';
import { selectCheckoutStep, type CheckoutStep } from '../checkout.slice';

// The persisted step is only a wish; the data decides. This one rule
// covers a refresh, closing and reopening, and switching product (see
// specs/07-web-checkout.md#derived-selectors).
export function useCheckoutStep(): CheckoutStep {
  const step = useAppSelector(selectCheckoutStep);
  const hasCard = useAppSelector((state) => selectCard(state) !== null);
  const hasContactDetails = useAppSelector((state) => selectContactDetails(state) !== null);

  if (step === 'SUMMARY' && hasCard) {
    return 'SUMMARY';
  }

  if (step !== 'CONTACT' && hasContactDetails) {
    return 'CARD';
  }

  return 'CONTACT';
}
