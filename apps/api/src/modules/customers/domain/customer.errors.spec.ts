import { ErrorCode } from '@checkout/shared/enums';

import { customerDataMismatch, customerNotFound, emailAlreadyRegistered } from './customer.errors';

const SAMPLE_DOCUMENT_NUMBER = '1000000001';
const SAMPLE_EMAIL = 'ana@mail.com';
const SAMPLE_PHONE = '3000000001';

describe('emailAlreadyRegistered', () => {
  it('builds a CONFLICT domain error with a generic detail', () => {
    const error = emailAlreadyRegistered();

    expect(error.code).toBe(ErrorCode.EMAIL_ALREADY_REGISTERED);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).not.toContain(SAMPLE_DOCUMENT_NUMBER);
    expect(error.detail).not.toContain(SAMPLE_EMAIL);
    expect(error.detail).not.toContain(SAMPLE_PHONE);
  });
});

describe('customerDataMismatch', () => {
  it('builds a CONFLICT domain error with a generic detail', () => {
    const error = customerDataMismatch();

    expect(error.code).toBe(ErrorCode.CUSTOMER_DATA_MISMATCH);
    expect(error.kind).toBe('CONFLICT');
    expect(error.detail).not.toContain(SAMPLE_DOCUMENT_NUMBER);
    expect(error.detail).not.toContain(SAMPLE_EMAIL);
    expect(error.detail).not.toContain(SAMPLE_PHONE);
  });
});

describe('customerNotFound', () => {
  it('builds a NOT_FOUND domain error with a generic detail', () => {
    const error = customerNotFound();

    expect(error.code).toBe(ErrorCode.CUSTOMER_NOT_FOUND);
    expect(error.kind).toBe('NOT_FOUND');
    expect(error.detail).not.toContain(SAMPLE_DOCUMENT_NUMBER);
    expect(error.detail).not.toContain(SAMPLE_EMAIL);
    expect(error.detail).not.toContain(SAMPLE_PHONE);
  });
});
