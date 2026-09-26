import { parseEnv, type EnvSource } from './parse-env';

const validSource: EnvSource = {
  VITE_API_BASE_URL: 'http://localhost/api/v1',
  VITE_API_MOCKING: 'true',
  VITE_PAYMENT_GATEWAY_URL: 'https://gateway.example.test',
  VITE_PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test_key',
  DEV: true,
};

describe('parseEnv', () => {
  it('parses a valid source into a typed Env', () => {
    expect(parseEnv(validSource)).toEqual({
      apiBaseUrl: 'http://localhost/api/v1',
      apiMocking: true,
      paymentGatewayUrl: 'https://gateway.example.test',
      paymentGatewayPublicKey: 'pub_test_key',
      isDev: true,
    });
  });

  it('parses VITE_API_MOCKING="false" as false', () => {
    expect(parseEnv({ ...validSource, VITE_API_MOCKING: 'false' }).apiMocking).toBe(false);
  });

  it('defaults isDev to false when DEV is not set', () => {
    const {
      VITE_API_BASE_URL,
      VITE_API_MOCKING,
      VITE_PAYMENT_GATEWAY_URL,
      VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
    } = validSource;

    expect(
      parseEnv({
        VITE_API_BASE_URL,
        VITE_API_MOCKING,
        VITE_PAYMENT_GATEWAY_URL,
        VITE_PAYMENT_GATEWAY_PUBLIC_KEY,
      }).isDev,
    ).toBe(false);
  });

  it.each([
    ['VITE_API_BASE_URL', 'missing'],
    ['VITE_API_BASE_URL', 'empty'],
    ['VITE_PAYMENT_GATEWAY_URL', 'missing'],
    ['VITE_PAYMENT_GATEWAY_URL', 'empty'],
    ['VITE_PAYMENT_GATEWAY_PUBLIC_KEY', 'missing'],
    ['VITE_PAYMENT_GATEWAY_PUBLIC_KEY', 'empty'],
  ] as const)('throws naming %s when it is %s', (key, mode) => {
    const source = { ...validSource, [key]: mode === 'empty' ? '' : undefined };

    expect(() => parseEnv(source)).toThrow(key);
  });

  it('throws naming VITE_API_MOCKING when it is missing', () => {
    const source = { ...validSource, VITE_API_MOCKING: undefined };

    expect(() => parseEnv(source)).toThrow('VITE_API_MOCKING');
  });

  it('throws naming VITE_API_MOCKING when it is neither "true" nor "false"', () => {
    const source = { ...validSource, VITE_API_MOCKING: 'yes' };

    expect(() => parseEnv(source)).toThrow('VITE_API_MOCKING');
  });
});
