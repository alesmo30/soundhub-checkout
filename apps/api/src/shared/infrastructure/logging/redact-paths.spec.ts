import { Writable } from 'node:stream';

import pino from 'pino';

import { REDACT_CENSOR, REDACT_PATHS } from './redact-paths';

function captureLogger(): { logger: pino.Logger; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR } }, stream);

  return { logger, lines: () => chunks.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

describe('REDACT_PATHS', () => {
  it('redacts a sensitive key at the top level', () => {
    const { logger, lines } = captureLogger();

    logger.info({ email: 'ana@example.com' }, 'top level');

    expect(lines()[0]?.email).toBe(REDACT_CENSOR);
  });

  it('redacts a sensitive key one level deep', () => {
    const { logger, lines } = captureLogger();

    logger.info({ customer: { email: 'ana@example.com' } }, 'one level deep');

    const customer = lines()[0]?.customer as Record<string, unknown>;
    expect(customer.email).toBe(REDACT_CENSOR);
  });

  it('redacts a sensitive key two levels deep', () => {
    const { logger, lines } = captureLogger();

    logger.info({ order: { customer: { documentNumber: '123456789' } } }, 'two levels deep');

    const order = lines()[0]?.order as Record<string, unknown>;
    const customer = order.customer as Record<string, unknown>;
    expect(customer.documentNumber).toBe(REDACT_CENSOR);
  });

  it('redacts the authorization header', () => {
    const { logger, lines } = captureLogger();

    logger.info({ req: { headers: { authorization: 'Bearer secret-token' } } }, 'auth header');

    const req = lines()[0]?.req as Record<string, unknown>;
    const headers = req.headers as Record<string, unknown>;
    expect(headers.authorization).toBe(REDACT_CENSOR);
  });

  it('leaves an unrelated field untouched', () => {
    const { logger, lines } = captureLogger();

    logger.info({ status: 'ok', cardBrand: 'VISA' }, 'unrelated fields');

    expect(lines()[0]?.status).toBe('ok');
    expect(lines()[0]?.cardBrand).toBe('VISA');
  });
});
