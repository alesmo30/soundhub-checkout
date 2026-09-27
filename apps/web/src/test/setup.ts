import '@testing-library/jest-dom';

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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
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
