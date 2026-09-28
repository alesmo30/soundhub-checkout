import approvedFixture from '../infrastructure/http/__fixtures__/transaction-updated-approved.json';
import { eventChecksum, isValidChecksum } from './event-checksum';

const TEST_EVENTS_SECRET = 'test-events-secret';
const APPROVED_CHECKSUM = 'd7632e883de891743415b69b8ac92ce8cb9ab71bf15bf7311bf1e98535628da1';

describe('eventChecksum', () => {
  it("matches the fixture's precomputed checksum", () => {
    const checksum = eventChecksum({
      data: approvedFixture.data,
      properties: approvedFixture.signature.properties,
      timestamp: approvedFixture.timestamp,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).toBe(APPROVED_CHECKSUM);
  });

  it('changes when the secret is wrong', () => {
    const checksum = eventChecksum({
      data: approvedFixture.data,
      properties: approvedFixture.signature.properties,
      timestamp: approvedFixture.timestamp,
      secret: 'wrong-secret',
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('changes when a signed field is tampered with', () => {
    const tamperedData = {
      ...approvedFixture.data,
      transaction: { ...approvedFixture.data.transaction, status: 'DECLINED' },
    };

    const checksum = eventChecksum({
      data: tamperedData,
      properties: approvedFixture.signature.properties,
      timestamp: approvedFixture.timestamp,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('changes when the timestamp is tampered with', () => {
    const checksum = eventChecksum({
      data: approvedFixture.data,
      properties: approvedFixture.signature.properties,
      timestamp: approvedFixture.timestamp + 1,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).not.toBe(APPROVED_CHECKSUM);
  });

  it('does not change when a field outside signature.properties is tampered with', () => {
    const tamperedData = {
      ...approvedFixture.data,
      transaction: { ...approvedFixture.data.transaction, status_message: 'changed' },
    };

    const checksum = eventChecksum({
      data: tamperedData,
      properties: approvedFixture.signature.properties,
      timestamp: approvedFixture.timestamp,
      secret: TEST_EVENTS_SECRET,
    });

    expect(checksum).toBe(APPROVED_CHECKSUM);
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
