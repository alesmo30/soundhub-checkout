import { persistStore, type Persistor } from 'redux-persist';

import { saveCard, saveContact, type ContactDetails } from '@/features/checkout';

import { makeStore } from './store';

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

const CARD = { token: 'tok_test_super_secret', brand: 'VISA' as const, last4: '4242' };
const ACCEPTANCE = {
  acceptanceToken: 'test-acceptance-token',
  personalDataAuthToken: 'test-personal-data-token',
};

function waitForBootstrap(persistor: Persistor) {
  return new Promise<void>((resolve) => {
    const unsubscribe = persistor.subscribe(() => {
      if (persistor.getState().bootstrapped) {
        unsubscribe();
        resolve();
      }
    });
  });
}

describe('store persistence', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists only the checkout and customer slices under the soundhub key', async () => {
    const store = makeStore();
    const persistor = persistStore(store);

    await waitForBootstrap(persistor);
    await persistor.flush();

    const raw = localStorage.getItem('persist:soundhub');
    expect(raw).not.toBeNull();

    const persisted = JSON.parse(raw as string) as Record<string, unknown>;

    expect(Object.keys(persisted).sort()).toEqual(['_persist', 'checkout', 'customer']);
  });

  it('creates independent stores per makeStore() call', () => {
    const storeA = makeStore();
    const storeB = makeStore();

    expect(storeA).not.toBe(storeB);
    expect(storeA.getState()).toEqual(storeB.getState());
  });

  it('never writes the card token, the document number or the CVC-adjacent card data to localStorage', async () => {
    const store = makeStore();
    const persistor = persistStore(store);
    await waitForBootstrap(persistor);

    store.dispatch(saveContact(CONTACT));
    store.dispatch(saveCard({ card: CARD, installments: 3, acceptance: ACCEPTANCE }));
    await persistor.flush();

    const raw = localStorage.getItem('persist:soundhub');
    expect(raw).not.toBeNull();
    expect(raw).not.toContain(CARD.token);
    expect(raw).not.toContain(CONTACT.customer.documentNumber);
    expect(raw).not.toContain(ACCEPTANCE.acceptanceToken);
    expect(raw).not.toContain(ACCEPTANCE.personalDataAuthToken);

    // The whole checkoutSession slice must be absent, not just individually
    // redacted: it is never in the persist whitelist.
    const persisted = JSON.parse(raw as string) as Record<string, unknown>;
    expect(persisted).not.toHaveProperty('checkoutSession');
  });

  it('keeps the in-memory checkoutSession out of persisted storage even though it is in the live store', async () => {
    const store = makeStore();
    store.dispatch(saveContact(CONTACT));

    expect(store.getState().checkoutSession.contact).toEqual(CONTACT);

    const persistor = persistStore(store);
    await waitForBootstrap(persistor);
    await persistor.flush();

    const raw = localStorage.getItem('persist:soundhub');
    const persisted = JSON.parse(raw as string) as Record<string, unknown>;
    expect(Object.keys(persisted).sort()).toEqual(['_persist', 'checkout', 'customer']);
  });
});

describe('persist migration v1 -> v2', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds step to checkout and resets customer to { remembered: null }', async () => {
    const v1Persisted = {
      _persist: JSON.stringify({ version: 1, rehydrated: true }),
      checkout: JSON.stringify({ productId: 'product-a', quantity: 3, isDialogOpen: false }),
      customer: JSON.stringify({}),
    };
    localStorage.setItem('persist:soundhub', JSON.stringify(v1Persisted));

    const store = makeStore();
    const persistor = persistStore(store);
    await waitForBootstrap(persistor);

    expect(store.getState().checkout).toEqual({
      productId: 'product-a',
      quantity: 3,
      isDialogOpen: false,
      step: 'CONTACT',
    });
    expect(store.getState().customer).toEqual({ remembered: null });
  });
});
