import '@testing-library/jest-dom';

import { resetTransactionsHandlersState } from '@/mocks/handlers/transactions.handlers';
import { server } from '@/mocks/server';

// jsdom does not implement matchMedia; vaul (Drawer) and prefers-reduced-motion
// checks need it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  });
}

// jsdom does not implement ResizeObserver; Radix's Checkbox measures its
// hidden bubble input with it whenever the checkbox sits inside a <form>.
if (!window.ResizeObserver) {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  resetTransactionsHandlersState();
});
afterAll(() => server.close());

jest.mock('@/config/env', () => ({
  env: {
    apiBaseUrl: 'http://localhost/api/v1',
    apiMocking: false,
    paymentGatewayUrl: 'https://gateway.example.test',
    paymentGatewayPublicKey: 'test-public-key',
    isDev: false,
  },
}));
