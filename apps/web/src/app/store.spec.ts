import { persistStore, type Persistor } from 'redux-persist';

import { makeStore } from './store';

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
});
