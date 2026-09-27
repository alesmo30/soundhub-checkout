import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  createMigrate,
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
  type MigrationManifest,
  type PersistedState,
  type PersistState,
} from 'redux-persist';

import { checkoutReducer, checkoutSessionReducer } from '@/features/checkout';
import { customerReducer } from '@/features/customer';
import { api } from '@/services/api';

import { localStorageEngine } from './local-storage-engine';

const PERSIST_KEY = 'soundhub';
const PERSIST_VERSION = 2;

const rootReducer = combineReducers({
  [api.reducerPath]: api.reducer,
  checkout: checkoutReducer,
  // Not persisted: the token, brand, last 4 and acceptance tokens live only
  // in memory (see specs/07-web-checkout.md#decisions, Persistence).
  checkoutSession: checkoutSessionReducer,
  customer: customerReducer,
});

// Version 1 predates `step` on `checkout` and the `remembered` shape of
// `customer`. Without this migration, redux-persist's level-1 merge would
// restore the old `checkout` object without `step`.
interface PersistedCheckoutV1 {
  productId: string | null;
  quantity: number;
  isDialogOpen: boolean;
}

interface PersistedStateV1 {
  _persist: PersistState;
  checkout?: PersistedCheckoutV1;
  customer?: unknown;
}

const migrations: MigrationManifest = {
  2: (state) => {
    // redux-persist only calls a migration with a defined state (it
    // short-circuits `!state` before running any migration), but the
    // library still types the parameter as possibly undefined.
    const v1: PersistedStateV1 | undefined = state;

    if (!v1) {
      return state;
    }

    // The migrated shape genuinely has more fields than `PersistedState`
    // (which only guarantees `_persist`); that's the point of a migration.
    return {
      ...v1,
      checkout: { ...v1.checkout, step: 'CONTACT' },
      customer: { remembered: null },
    } as PersistedState;
  },
};

const persistConfig = {
  key: PERSIST_KEY,
  version: PERSIST_VERSION,
  storage: localStorageEngine,
  whitelist: ['checkout', 'customer'],
  migrate: createMigrate(migrations, { debug: false }),
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export type RootState = ReturnType<typeof persistedReducer>;

export function makeStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: persistedReducer,
    preloadedState: preloadedState as RootState | undefined,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
        },
      }).concat(api.middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];

export const store = makeStore();
export const persistor = persistStore(store);
