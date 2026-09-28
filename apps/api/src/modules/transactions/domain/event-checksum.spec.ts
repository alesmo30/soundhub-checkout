import { eventChecksum, isValidChecksum } from './event-checksum';

// Same values as infrastructure/http/__fixtures__/transaction-updated-approved.json,
// inlined rather than imported: domain/ must not depend on infrastructure/
// (references/layering.md).
const PROPERTIES = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
const TIMESTAMP = 1530291411;
const TEST_EVENTS_SECRET = 'test-events-secret';
const APPROVED_CHECKSUM = 'd7632e883de891743415b69b8ac92ce8cb9ab71bf15bf7311bf1e98535628da1';

function buildData(overrides: { status?: string; statusMessage?: string } = {}): unknown {
  return {
    transaction: {
      id: '15379-1530291411-92993',
      amount_in_cents: 4490000,
      reference: 'TX-20260927-ABC123',
      customer_email: 'buyer@example.com',
      currency: 'COP',
      status: overrides.status ?? 'APPROVED',
      status_message: overrides.statusMessage ?? null,
    },
  };
}

describe('eventChecksum', () => {
  it("matches the fixture's precomputed checksum", () => {
    const checksum = eventChecksum({
      data: buildData(),
      properties: PROPERTIES,
      timestamp: TIMESTAMP,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).toBe(APPROVED_CHECKSUM);
  });

  it('changes when the secret is wrong', () => {
    const checksum = eventChecksum({
      data: buildData(),
      properties: PROPERTIES,
      timestamp: TIMESTAMP,
      secret: 'wrong-secret',
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('changes when a signed field is tampered with', () => {
    const checksum = eventChecksum({
      data: buildData({ status: 'DECLINED' }),
      properties: PROPERTIES,
      timestamp: TIMESTAMP,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('changes when the timestamp is tampered with', () => {
    const checksum = eventChecksum({
      data: buildData(),
      properties: PROPERTIES,
      timestamp: TIMESTAMP + 1,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('does not change when a field outside signature.properties is tampered with', () => {
    const checksum = eventChecksum({
      data: buildData({ statusMessage: 'changed' }),
      properties: PROPERTIES,
      timestamp: TIMESTAMP,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).toBe(APPROVED_CHECKSUM);
  });

  it('treats a missing or non-object path segment as an empty string, without throwing', () => {
    expect(() =>
      eventChecksum({
        data: buildData(),
        properties: ['transaction.does_not_exist', 'transaction.status.nested'],
        timestamp: TIMESTAMP,
        secret: TEST_EVENTS_SECRET,
      }),
    ).not.toThrow();
  });
});

describe('isValidChecksum', () => {
  it('returns true for equal checksums', () => {
    expect(isValidChecksum(APPROVED_CHECKSUM, APPROVED_CHECKSUM)).toBe(true);
  });

  it('returns false for a mismatch of the same length', () => {
    const differentSameLength = `${'f'.repeat(63)}0`;
    expect(isValidChecksum(APPROVED_CHECKSUM, differentSameLength)).toBe(false);
  });

  it('returns false on a length mismatch without throwing', () => {
    expect(() => isValidChecksum(APPROVED_CHECKSUM, 'too-short')).not.toThrow();
    expect(isValidChecksum(APPROVED_CHECKSUM, 'too-short')).toBe(false);
  });
});
