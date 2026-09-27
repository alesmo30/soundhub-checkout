import type { WebStorage } from 'redux-persist/lib/types';

// redux-persist/lib/storage's CJS default export gets double-wrapped by
// Vite's esbuild dependency pre-bundling (storage.default.getItem instead of
// storage.getItem), so it's reimplemented here directly against
// window.localStorage instead.
export const localStorageEngine: WebStorage = {
  getItem: (key) => Promise.resolve(window.localStorage.getItem(key)),
  setItem: (key, value) => Promise.resolve(window.localStorage.setItem(key, value)),
  removeItem: (key) => Promise.resolve(window.localStorage.removeItem(key)),
};
