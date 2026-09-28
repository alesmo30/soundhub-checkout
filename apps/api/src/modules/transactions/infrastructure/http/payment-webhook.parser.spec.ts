import approvedFixture from './__fixtures__/transaction-updated-approved.json';
import otherEventFixture from './__fixtures__/other-event.json';
import { parsePaymentEvent } from './payment-webhook.parser';

describe('parsePaymentEvent', () => {
  it('parses a transaction.updated event', () => {
    const parsed = parsePaymentEvent(approvedFixture);

    expect(parsed).toEqual({
      event: 'transaction.updated',
      providerTransactionId: '15379-1530291411-92993',
      providerStatus: 'APPROVED',
      statusMessage: null,
      signature: { properties: approvedFixture.signature.properties },
      timestamp: approvedFixture.timestamp,
      data: approvedFixture.data,
    });
  });

  it('parses an event whose event type is not transaction.updated (still valid, handled by the use case)', () => {
    const parsed = parsePaymentEvent(otherEventFixture);

    expect(parsed?.event).toBe('transaction.created');
  });

  it('ignores extra unknown fields', () => {
    const withExtra = { ...approvedFixture, unexpected_field: 'whatever' };

    expect(parsePaymentEvent(withExtra)).not.toBeNull();
  });

  it.each([
    ['a non-object body', 'not-an-object'],
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
  ])('returns null for %s', (_label, body) => {
    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when data.transaction.id is missing', () => {
    const body = {
      ...approvedFixture,
      data: { transaction: { ...approvedFixture.data.transaction, id: undefined } },
    };

    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when data.transaction.status is missing', () => {
    const body = {
      ...approvedFixture,
      data: { transaction: { ...approvedFixture.data.transaction, status: undefined } },
    };

    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when signature is missing', () => {
    const { signature, ...withoutSignature } = approvedFixture;
    void signature;

    expect(parsePaymentEvent(withoutSignature)).toBeNull();
  });

  it('returns null when signature.properties is not an array of strings', () => {
    const body = { ...approvedFixture, signature: { properties: 'not-an-array' } };

    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when event is not a string', () => {
    const body = { ...approvedFixture, event: 123 };

    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when timestamp is not a number', () => {
    const body = { ...approvedFixture, timestamp: '1530291411' };

    expect(parsePaymentEvent(body)).toBeNull();
  });

  it('returns null when data is not an object', () => {
    const body = { ...approvedFixture, data: 'not-an-object' };

    expect(parsePaymentEvent(body)).toBeNull();
  });
});
