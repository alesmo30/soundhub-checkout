import { loadDeployEnv, type DeployEnv } from '../lib/config/deploy-env';

const validSource: Record<string, string> = {
  PAYMENT_GATEWAY_URL: 'https://gateway.example.test',
  PAYMENT_GATEWAY_PUBLIC_KEY: 'pub_test_key',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  EMAIL_FROM: 'SoundHub <no-reply@example.test>',
};

describe('loadDeployEnv', () => {
  it('reads every deploy variable', () => {
    const result: DeployEnv = loadDeployEnv(validSource);

    expect(result).toEqual({
      paymentGatewayUrl: 'https://gateway.example.test',
      paymentGatewayPublicKey: 'pub_test_key',
      smtpHost: 'smtp.example.test',
      smtpPort: 465,
      emailFrom: 'SoundHub <no-reply@example.test>',
    });
  });

  it('parses SMTP_PORT as a number', () => {
    const result = loadDeployEnv(validSource);

    expect(typeof result.smtpPort).toBe('number');
    expect(result.smtpPort).toBe(465);
  });

  it.each(Object.keys(validSource))('throws naming %s when missing', (key) => {
    const source = { ...validSource };
    delete source[key];

    expect(() => loadDeployEnv(source)).toThrow(`Missing deploy variable: ${key}`);
  });

  it.each(Object.keys(validSource))('throws naming %s when empty', (key) => {
    const source = { ...validSource, [key]: '' };

    expect(() => loadDeployEnv(source)).toThrow(`Missing deploy variable: ${key}`);
  });
});
