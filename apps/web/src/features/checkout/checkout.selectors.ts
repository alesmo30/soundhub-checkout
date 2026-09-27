import { selectRememberedDetails, type CustomerState } from '@/features/customer';

import { selectQuoteMunicipalityCode, selectSessionContact } from './checkout-session.slice';
import type { CheckoutSessionState } from './checkout-session.slice';
import type { ContactDetails } from './lib/contact-details';

// Structural, not `RootState`: importing RootState from `@/app/store` here
// would create a real module cycle (store.ts -> features/checkout/index.ts
// -> this file -> app/store.ts). Any object with these two slice shapes
// works, `RootState` included.
interface SelectorState {
  checkoutSession: CheckoutSessionState;
  customer: CustomerState;
}

export function selectContactDetails(state: SelectorState): ContactDetails | null {
  return selectSessionContact(state) ?? selectRememberedDetails(state);
}

export function selectQuoteMunicipality(state: SelectorState): string | null {
  return selectQuoteMunicipalityCode(state) ?? selectContactDetails(state)?.address.municipalityCode ?? null;
}
