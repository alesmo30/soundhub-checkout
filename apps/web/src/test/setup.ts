import '@testing-library/jest-dom';

import { server } from '@/mocks/server';

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
