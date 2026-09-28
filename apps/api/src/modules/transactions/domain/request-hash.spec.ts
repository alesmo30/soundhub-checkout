import { requestHash } from './request-hash';

describe('requestHash', () => {
  it('is a 64-character SHA-256 hex digest', () => {
    expect(requestHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not change when top-level and nested keys are reordered', () => {
    const original = { b: 1, a: { d: 2, c: 3 } };
    const reordered = { a: { c: 3, d: 2 }, b: 1 };

    expect(requestHash(original)).toBe(requestHash(reordered));
  });

  it('changes when array element order changes', () => {
    const original = { items: [1, 2, 3], b: 1 };
    const reorderedArray = { items: [3, 2, 1], b: 1 };

    expect(requestHash(original)).not.toBe(requestHash(reorderedArray));
  });

  it('is stable for the same array order regardless of surrounding key order', () => {
    const original = { items: [1, 2, 3], meta: { z: 1, a: 2 } };
    const reorderedKeys = { meta: { a: 2, z: 1 }, items: [1, 2, 3] };

    expect(requestHash(original)).toBe(requestHash(reorderedKeys));
  });
});
