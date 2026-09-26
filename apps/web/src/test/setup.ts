import '@testing-library/jest-dom';

jest.mock('@/config/env', () => ({
  env: {
    apiBaseUrl: 'http://localhost/api/v1',
    apiMocking: false,
    paymentGatewayUrl: 'https://gateway.example.test',
    paymentGatewayPublicKey: 'test-public-key',
    isDev: false,
  },
}));
