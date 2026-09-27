import { env } from '@/config/env';

interface MerchantResponseBody {
  data: {
    presigned_acceptance: { acceptance_token: string; permalink: string };
    presigned_personal_data_auth: { acceptance_token: string; permalink: string };
  };
}

interface TokenizeCardSuccessBody {
  data: { id: string; brand: string; last_four: string };
}

interface TokenizeCardErrorBody {
  error: { type: string };
}

describe('payment gateway handlers', () => {
  it('GET /merchants/:publicKey returns both presigned tokens with their permalinks', async () => {
    const response = await fetch(
      `${env.paymentGatewayUrl}/merchants/${env.paymentGatewayPublicKey}`,
    );
    const body = (await response.json()) as MerchantResponseBody;

    expect(response.status).toBe(200);
    expect(body.data.presigned_acceptance.acceptance_token).toBe('test-acceptance-token');
    expect(body.data.presigned_acceptance.permalink).toBe(
      'https://example.test/terms-and-conditions',
    );
    expect(body.data.presigned_personal_data_auth.acceptance_token).toBe(
      'test-personal-data-token',
    );
    expect(body.data.presigned_personal_data_auth.permalink).toBe(
      'https://example.test/personal-data-auth',
    );
  });

  it('POST /tokens/cards with 4242… tokenizes as a VISA test card', async () => {
    const response = await fetch(`${env.paymentGatewayUrl}/tokens/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: '4242424242424242' }),
    });
    const body = (await response.json()) as TokenizeCardSuccessBody;

    expect(response.status).toBe(201);
    expect(body.data.brand).toBe('VISA');
    expect(body.data.last_four).toBe('4242');
  });

  it('POST /tokens/cards with 4111… tokenizes as a VISA test card', async () => {
    const response = await fetch(`${env.paymentGatewayUrl}/tokens/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: '4111111111111111' }),
    });
    const body = (await response.json()) as TokenizeCardSuccessBody;

    expect(response.status).toBe(201);
    expect(body.data.last_four).toBe('1111');
  });

  it('POST /tokens/cards with any other number returns a validation error', async () => {
    const response = await fetch(`${env.paymentGatewayUrl}/tokens/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: '5555555555554444' }),
    });
    const body = (await response.json()) as TokenizeCardErrorBody;

    expect(response.status).toBe(422);
    expect(body.error.type).toBe('INPUT_VALIDATION_ERROR');
  });
});
