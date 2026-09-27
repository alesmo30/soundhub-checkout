import { HttpResponse, http } from 'msw';

// Card numbers that tokenize successfully in the sandbox, per the spec's
// test-mode note (see specs/07-web-checkout.md#ui-rules).
const APPROVED_CARD_PREFIXES = ['4242', '4111'];

interface TokenizeCardRequestBody {
  number?: string;
}

export const paymentGatewayHandlers = [
  http.get('*/merchants/:publicKey', () => {
    return HttpResponse.json({
      data: {
        presigned_acceptance: {
          acceptance_token: 'test-acceptance-token',
          permalink: 'https://example.test/terms-and-conditions',
        },
        presigned_personal_data_auth: {
          acceptance_token: 'test-personal-data-token',
          permalink: 'https://example.test/personal-data-auth',
        },
      },
    });
  }),

  http.post('*/tokens/cards', async ({ request }) => {
    const body = (await request.json()) as TokenizeCardRequestBody;
    const number = body.number ?? '';
    const isApproved = APPROVED_CARD_PREFIXES.some((prefix) => number.startsWith(prefix));

    if (!isApproved) {
      return HttpResponse.json({ error: { type: 'INPUT_VALIDATION_ERROR' } }, { status: 422 });
    }

    return HttpResponse.json(
      {
        data: {
          id: `tok_test_${number.slice(-4)}`,
          brand: 'VISA',
          last_four: number.slice(-4),
        },
      },
      { status: 201 },
    );
  }),
];
