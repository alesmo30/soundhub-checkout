import create401 from './__fixtures__/create-401.json';
import create422InvalidToken from './__fixtures__/create-422-invalid-token.json';
import { classifyGatewayError } from './gateway-error.classifier';

describe('classifyGatewayError', () => {
  it('classifies a 422 with a nested field message as REJECTED, extracting that message', () => {
    const error = classifyGatewayError(422, create422InvalidToken);

    expect(error).toEqual({ kind: 'REJECTED', message: 'The token field is not valid' });
  });

  // create-401.json is a minimal, hand-written fixture: gateway-findings.md
  // documents the nested-message shape only for the 422 case, so this
  // fixture asserts only what the spec confirms — a 401 classifies as
  // REJECTED — without assuming an unconfirmed real 401 body shape.
  it('classifies a 401 as REJECTED too, so stock is not held on a bad key', () => {
    const error = classifyGatewayError(401, create401);

    expect(error.kind).toBe('REJECTED');
  });

  it('classifies any other 4xx as REJECTED with a generic message when there is no nested field message', () => {
    const error = classifyGatewayError(409, { error: { type: 'SOME_CONFLICT' } });

    expect(error).toEqual({ kind: 'REJECTED', message: 'SOME_CONFLICT' });
  });

  it('falls back to a generic REJECTED message when the body has no usable error shape at all', () => {
    const error = classifyGatewayError(400, {});

    expect(error).toEqual({
      kind: 'REJECTED',
      message: 'The payment gateway rejected the request',
    });
  });

  // No 5xx fixture exists (see the file tree in specs/08-api-create-transaction.md:
  // only 8 fixtures are listed and none is a 5xx capture). classification does not
  // depend on the body shape for 5xx, so an inline object is enough here.
  it('classifies a 500 as UNAVAILABLE regardless of body shape', () => {
    const error = classifyGatewayError(500, { error: { type: 'INTERNAL_SERVER_ERROR' } });

    expect(error).toEqual({ kind: 'UNAVAILABLE', message: 'The payment gateway is unavailable' });
  });

  it('classifies a 503 as UNAVAILABLE even with an empty body', () => {
    const error = classifyGatewayError(503, {});

    expect(error).toEqual({ kind: 'UNAVAILABLE', message: 'The payment gateway is unavailable' });
  });

  it('skips a field whose nested messages is not itself a record', () => {
    const error = classifyGatewayError(422, {
      error: {
        type: 'INPUT_VALIDATION_ERROR',
        messages: { payment_method: { messages: 'not-a-record' } },
      },
    });

    expect(error).toEqual({ kind: 'REJECTED', message: 'INPUT_VALIDATION_ERROR' });
  });

  it('skips an inner value that is not an array before falling back to the type', () => {
    const error = classifyGatewayError(422, {
      error: {
        type: 'INPUT_VALIDATION_ERROR',
        messages: { payment_method: { messages: { token: 'not-an-array' } } },
      },
    });

    expect(error).toEqual({ kind: 'REJECTED', message: 'INPUT_VALIDATION_ERROR' });
  });

  it('keeps looking at later fields when an earlier one has no usable message', () => {
    const error = classifyGatewayError(422, {
      error: {
        type: 'INPUT_VALIDATION_ERROR',
        messages: {
          acceptance_token: { messages: { token: [] } },
          payment_method: { messages: { token: ['The token field is not valid'] } },
        },
      },
    });

    expect(error).toEqual({ kind: 'REJECTED', message: 'The token field is not valid' });
  });
});
