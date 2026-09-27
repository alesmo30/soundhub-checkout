import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';

import { makeStore, type AppStore } from '@/app/store';
import { rememberDetails, type RememberedContactDetails } from '@/features/customer';

import { saveCard, saveContact } from '../checkout-session.slice';
import { goToStep } from '../checkout.slice';
import type { ContactDetails } from '../lib/contact-details';
import { useCheckoutStep } from './use-checkout-step';

const CONTACT: ContactDetails = {
  customer: {
    documentNumber: '1234567890',
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '3001234567',
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Calle 1 # 2-3',
  },
};

const CARD = { token: 'tok_test_123', brand: 'VISA' as const, last4: '4242' };
const ACCEPTANCE = {
  acceptanceToken: 'test-acceptance-token',
  personalDataAuthToken: 'test-personal-data-token',
};

function setup(arrange: (store: AppStore) => void) {
  const store = makeStore();
  arrange(store);

  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return renderHook(() => useCheckoutStep(), { wrapper }).result;
}

describe('useCheckoutStep', () => {
  it('defaults to CONTACT with an empty store', () => {
    expect(setup(() => {}).current).toBe('CONTACT');
  });

  it('stays on CONTACT when the persisted step is CONTACT, even with a full session', () => {
    const result = setup((store) => {
      store.dispatch(saveContact(CONTACT));
      store.dispatch(saveCard({ card: CARD, installments: 1, acceptance: ACCEPTANCE }));
      store.dispatch(goToStep('CONTACT'));
    });

    expect(result.current).toBe('CONTACT');
  });

  it('moves to SUMMARY only when the persisted step is SUMMARY and a card was saved', () => {
    const result = setup((store) => {
      store.dispatch(saveContact(CONTACT));
      store.dispatch(saveCard({ card: CARD, installments: 1, acceptance: ACCEPTANCE }));
      store.dispatch(goToStep('SUMMARY'));
    });

    expect(result.current).toBe('SUMMARY');
  });

  it('falls back to CARD when the step is SUMMARY but the card was dropped (e.g. closeCheckout)', () => {
    const result = setup((store) => {
      store.dispatch(saveContact(CONTACT));
      store.dispatch(goToStep('SUMMARY'));
    });

    expect(result.current).toBe('CARD');
  });

  it('falls back to CONTACT when the step is not CONTACT but there are no contact details', () => {
    const result = setup((store) => {
      store.dispatch(goToStep('CARD'));
    });

    expect(result.current).toBe('CONTACT');
  });

  it('lands on CARD on a refresh with remembered details (step CARD, no session)', () => {
    const remembered: RememberedContactDetails = CONTACT;
    const result = setup((store) => {
      store.dispatch(rememberDetails(remembered));
      store.dispatch(goToStep('CARD'));
    });

    expect(result.current).toBe('CARD');
  });

  it('lands on CARD on a refresh with remembered details (step SUMMARY, no session)', () => {
    const remembered: RememberedContactDetails = CONTACT;
    const result = setup((store) => {
      store.dispatch(rememberDetails(remembered));
      store.dispatch(goToStep('SUMMARY'));
    });

    expect(result.current).toBe('CARD');
  });
});
