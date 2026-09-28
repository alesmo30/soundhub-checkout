import byReferenceEmpty from './__fixtures__/by-reference-empty.json';
import byReferenceOne from './__fixtures__/by-reference-one.json';
import createPending from './__fixtures__/create-pending.json';
import getApproved from './__fixtures__/get-approved.json';
import getDeclined from './__fixtures__/get-declined.json';
import getThreeDsEmpty from './__fixtures__/get-three-ds-empty.json';
import { toGatewayCharge, toGatewayChargeFromReferenceLookup } from './gateway-response.mapper';

describe('toGatewayCharge', () => {
  it.each([
    ['create-pending.json', createPending, 'PENDING'],
    ['get-approved.json', getApproved, 'APPROVED'],
    ['get-declined.json', getDeclined, 'DECLINED'],
    ['get-three-ds-empty.json', getThreeDsEmpty, 'PENDING'],
  ] as const)('maps %s to status %s', (_name, fixture, expectedStatus) => {
    expect(toGatewayCharge(fixture).status).toBe(expectedStatus);
  });

  it('maps an unrecognized provider status to PENDING, never finalizing on a guess', () => {
    const body = { data: { ...getApproved.data, status: 'SOME_NEW_PROVIDER_STATUS' } };

    expect(toGatewayCharge(body).status).toBe('PENDING');
  });

  it('reads card brand and last 4 from payment_method.extra', () => {
    const charge = toGatewayCharge(getApproved);

    expect(charge.cardBrand).toBe('VISA');
    expect(charge.cardLast4).toBe('4242');
  });

  it('returns null brand and last 4 when payment_method or extra is missing', () => {
    const withoutPaymentMethod = toGatewayCharge({ data: { id: 'fake-txn-x', status: 'PENDING' } });
    const withoutExtra = toGatewayCharge({
      data: { id: 'fake-txn-y', status: 'PENDING', payment_method: { type: 'CARD' } },
    });

    expect(withoutPaymentMethod.cardBrand).toBeNull();
    expect(withoutPaymentMethod.cardLast4).toBeNull();
    expect(withoutExtra.cardBrand).toBeNull();
    expect(withoutExtra.cardLast4).toBeNull();
  });

  it('ignores unrelated noise fields such as merchant and entries', () => {
    const charge = toGatewayCharge(getApproved);

    expect(charge).toStrictEqual({
      providerTransactionId: 'fake-txn-00000002',
      status: 'APPROVED',
      statusMessage: null,
      cardBrand: 'VISA',
      cardLast4: '4242',
    });
    expect(charge).not.toHaveProperty('merchant');
    expect(charge).not.toHaveProperty('entries');
  });

  it('maps status_message when the provider sends one', () => {
    expect(toGatewayCharge(getDeclined).statusMessage).toBe(
      'The transaction was declined by the issuing bank',
    );
  });

  it('does not throw when three_ds_auth is an empty object', () => {
    expect(() => toGatewayCharge(getThreeDsEmpty)).not.toThrow();
  });

  it('does not throw when three_ds_auth is populated', () => {
    expect(() => toGatewayCharge(getApproved)).not.toThrow();
    expect(getApproved.data.three_ds_auth).toEqual({
      current_step: 'AUTHENTICATION',
      current_step_status: 'APPROVED',
    });
  });

  it('defaults the provider transaction id to an empty string when the field is missing or not a string', () => {
    expect(toGatewayCharge({ data: { status: 'PENDING' } }).providerTransactionId).toBe('');
    expect(toGatewayCharge({ data: { id: 42, status: 'PENDING' } }).providerTransactionId).toBe(
      '',
    );
  });

  it('falls back to an empty charge when the body is not an object at all', () => {
    expect(toGatewayCharge('not-a-body')).toStrictEqual({
      providerTransactionId: '',
      status: 'PENDING',
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    });
  });

  it('falls back to an empty charge when data is missing', () => {
    expect(toGatewayCharge({})).toStrictEqual({
      providerTransactionId: '',
      status: 'PENDING',
      statusMessage: null,
      cardBrand: null,
      cardLast4: null,
    });
  });
});

describe('toGatewayChargeFromReferenceLookup', () => {
  it('maps the single match of a by-reference lookup', () => {
    const charge = toGatewayChargeFromReferenceLookup(byReferenceOne);

    expect(charge).toStrictEqual({
      providerTransactionId: 'fake-txn-00000002',
      status: 'APPROVED',
      statusMessage: null,
      cardBrand: 'VISA',
      cardLast4: '4242',
    });
  });

  it('returns null when the by-reference lookup has zero matches', () => {
    expect(toGatewayChargeFromReferenceLookup(byReferenceEmpty)).toBeNull();
  });

  it('returns null when the body is not an object at all', () => {
    expect(toGatewayChargeFromReferenceLookup('not-a-body')).toBeNull();
  });

  it('returns null when data is present but is not an array', () => {
    expect(toGatewayChargeFromReferenceLookup({ data: 'not-an-array' })).toBeNull();
  });
});
