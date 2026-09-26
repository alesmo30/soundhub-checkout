import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
} from 'redux-persist';

import { checkoutReducer } from '@/features/checkout';
import { customerReducer } from '@/features/customer';

import { localStorageEngine } from './local-storage-engine';

const PERSIST_KEY = 'soundhub';
const PERSIST_VERSION = 1;

const rootReducer = combineReducers({
  checkout: checkoutReducer,
  customer: customerReducer,
});

const persistConfig = {
  key: PERSIST_KEY,
  version: PERSIST_VERSION,
  storage: localStorageEngine,
  whitelist: ['checkout', 'customer'],
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
      }),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];

export const store = makeStore();
export const persistor = persistStore(store);
