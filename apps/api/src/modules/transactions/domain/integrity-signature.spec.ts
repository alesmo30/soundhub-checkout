import { integritySignature } from './integrity-signature';

describe('integritySignature', () => {
  it('matches a precomputed SHA-256 of reference + amountInCents + currency + secret', () => {
    // Computed independently with Node's crypto module for the same
    // concatenation: 'TX-20260927-ABC123' + 379980000 + 'COP' + 'test-secret'.
    const expected = 'caf3a13cda68116353c5118937f2f1f156a05072884a6852b802aae6e1b61b7f';

    const signature = integritySignature({
      reference: 'TX-20260927-ABC123',
      amountInCents: 379_980_000,
      currency: 'COP',
      secret: 'test-secret',
    });

    expect(signature).toBe(expected);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when any input field changes', () => {
    const base = {
      reference: 'TX-20260927-ABC123',
      amountInCents: 379_980_000,
      currency: 'COP',
      secret: 'test-secret',
    };

    const baseline = integritySignature(base);

    expect(integritySignature({ ...base, amountInCents: 1 })).not.toBe(baseline);
    expect(integritySignature({ ...base, currency: 'USD' })).not.toBe(baseline);
    expect(integritySignature({ ...base, secret: 'other-secret' })).not.toBe(baseline);
  });
});
