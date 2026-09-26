import {
  PHONE_PATTERN,
  NATIONAL_ID_PATTERN,
  MUNICIPALITY_CODE_PATTERN,
  DEPARTMENT_CODE_PATTERN,
} from './patterns';

describe('PHONE_PATTERN', () => {
  it('accepts a 10-digit number starting with 3', () => {
    expect(PHONE_PATTERN.test('3001234567')).toBe(true);
  });

  it('rejects a number not starting with 3', () => {
    expect(PHONE_PATTERN.test('2001234567')).toBe(false);
  });

  it('rejects a number with the wrong length', () => {
    expect(PHONE_PATTERN.test('300123456')).toBe(false);
    expect(PHONE_PATTERN.test('30012345678')).toBe(false);
  });
});

describe('NATIONAL_ID_PATTERN', () => {
  it('accepts 6 to 10 digits', () => {
    expect(NATIONAL_ID_PATTERN.test('123456')).toBe(true);
    expect(NATIONAL_ID_PATTERN.test('1234567890')).toBe(true);
  });

  it('rejects fewer than 6 digits', () => {
    expect(NATIONAL_ID_PATTERN.test('12345')).toBe(false);
  });

  it('rejects more than 10 digits', () => {
    expect(NATIONAL_ID_PATTERN.test('12345678901')).toBe(false);
  });

  it('rejects non-digit characters', () => {
    expect(NATIONAL_ID_PATTERN.test('12345a')).toBe(false);
  });
});

describe('MUNICIPALITY_CODE_PATTERN', () => {
  it('accepts a 5-digit DANE code', () => {
    expect(MUNICIPALITY_CODE_PATTERN.test('11001')).toBe(true);
  });

  it('rejects a code with the wrong length', () => {
    expect(MUNICIPALITY_CODE_PATTERN.test('1100')).toBe(false);
    expect(MUNICIPALITY_CODE_PATTERN.test('110011')).toBe(false);
  });
});

describe('DEPARTMENT_CODE_PATTERN', () => {
  it('accepts a 2-digit department code', () => {
    expect(DEPARTMENT_CODE_PATTERN.test('11')).toBe(true);
  });

  it('rejects a code with the wrong length', () => {
    expect(DEPARTMENT_CODE_PATTERN.test('1')).toBe(false);
    expect(DEPARTMENT_CODE_PATTERN.test('111')).toBe(false);
  });
});
