import { HttpResponse, http } from 'msw';
import { CardBrand } from '@checkout/shared/enums';
import type { CardFormValues } from '@checkout/shared/validation';

import { server } from '@/mocks/server';

import { fetchAcceptanceTokens, tokenizeCard } from './payment-gateway';

const cardValues: CardFormValues = {
  holder: 'Jane Doe',
  number: '4242424242424242',
  expiry: '12/29',
  cvc: '123',
  installments: 1,
};

describe('fetchAcceptanceTokens', () => {
  it('maps both presigned tokens and their permalinks', async () => {
    const terms = await fetchAcceptanceTokens();

    expect(terms).toEqual({
      acceptanceToken: 'test-acceptance-token',
      termsUrl: 'https://example.test/terms-and-conditions',
      personalDataAuthToken: 'test-personal-data-token',
      personalDataUrl: 'https://example.test/personal-data-auth',
    });
  });

  it('throws on a non-2xx response', async () => {
    server.use(http.get('*/merchants/:publicKey', () => HttpResponse.json({}, { status: 500 })));

    await expect(fetchAcceptanceTokens()).rejects.toThrow();
  });

  it('never logs anything, on success or failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    await fetchAcceptanceTokens();

    server.use(http.get('*/merchants/:publicKey', () => HttpResponse.json({}, { status: 500 })));
    await fetchAcceptanceTokens().catch(() => undefined);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});

describe('tokenizeCard', () => {
  it('splits the MM/AA expiry into exp_month and exp_year in the request body', async () => {
    let receivedBody: Record<string, unknown> = {};

    server.use(
      http.post('*/tokens/cards', async ({ request }) => {
        receivedBody = (await request.json()) as Record<string, unknown>;

        return HttpResponse.json(
          { data: { id: 'tok_test_4242', brand: 'VISA', last_four: '4242' } },
          { status: 201 },
        );
      }),
    );

    await tokenizeCard(cardValues);

    expect(receivedBody).toEqual({
      number: '4242424242424242',
      cvc: '123',
      exp_month: '12',
      exp_year: '29',
      card_holder: 'Jane Doe',
    });
  });

  it('sends the public key as a bearer token', async () => {
    let receivedAuth: string | null = null;

    server.use(
      http.post('*/tokens/cards', ({ request }) => {
        receivedAuth = request.headers.get('Authorization');

        return HttpResponse.json(
          { data: { id: 'tok_test_4242', brand: 'VISA', last_four: '4242' } },
          { status: 201 },
        );
      }),
    );

    await tokenizeCard(cardValues);

    expect(receivedAuth).toBe('Bearer test-public-key');
  });

  it('returns ok with { token, brand, last4 } for an approved card', async () => {
    const result = await tokenizeCard(cardValues);

    expect(result).toEqual({
      ok: true,
      card: { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' },
    });
  });

  it('returns INVALID_CARD for a 422 response', async () => {
    server.use(
      http.post('*/tokens/cards', () =>
        HttpResponse.json({ error: { type: 'INPUT_VALIDATION_ERROR' } }, { status: 422 }),
      ),
    );

    const result = await tokenizeCard({ ...cardValues, number: '9999999999999999' });

    expect(result).toEqual({ ok: false, reason: 'INVALID_CARD' });
  });

  it('returns INVALID_CARD for an unrecognized brand', async () => {
    server.use(
      http.post('*/tokens/cards', () =>
        HttpResponse.json(
          { data: { id: 'tok_test_4242', brand: 'AMEX', last_four: '4242' } },
          { status: 201 },
        ),
      ),
    );

    const result = await tokenizeCard(cardValues);

    expect(result).toEqual({ ok: false, reason: 'INVALID_CARD' });
  });

  it('returns UNAVAILABLE for a 500 response', async () => {
    server.use(http.post('*/tokens/cards', () => HttpResponse.json({}, { status: 500 })));

    const result = await tokenizeCard(cardValues);

    expect(result).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('returns UNAVAILABLE for a network error', async () => {
    server.use(http.post('*/tokens/cards', () => HttpResponse.error()));

    const result = await tokenizeCard(cardValues);

    expect(result).toEqual({ ok: false, reason: 'UNAVAILABLE' });
  });

  it('never logs anything, on success or failure', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

    await tokenizeCard(cardValues);

    server.use(http.post('*/tokens/cards', () => HttpResponse.error()));
    await tokenizeCard(cardValues);

    server.use(
      http.post('*/tokens/cards', () =>
        HttpResponse.json({ error: { type: 'INPUT_VALIDATION_ERROR' } }, { status: 422 }),
      ),
    );
    await tokenizeCard(cardValues);

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(consoleWarnSpy).not.toHaveBeenCalled();
    expect(consoleLogSpy).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });
});
