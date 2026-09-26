import { customerSchema } from './customer.schema';
import { VALIDATION_MESSAGES } from './messages';

describe('customerSchema', () => {
  const valid = {
    documentNumber: '123456789',
    fullName: 'Juan Perez',
    email: 'juan@example.com',
    phone: '3001234567',
  };

  it('accepts valid values', () => {
    expect(customerSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an 11-digit phone', () => {
    const result = customerSchema.safeParse({ ...valid, phone: '30012345678' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_MESSAGES.PHONE_INVALID);
  });

  it('rejects a phone starting with 2', () => {
    const result = customerSchema.safeParse({ ...valid, phone: '2001234567' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_MESSAGES.PHONE_INVALID);
  });

  it('rejects a 5-digit national ID', () => {
    const result = customerSchema.safeParse({ ...valid, documentNumber: '12345' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_MESSAGES.DOCUMENT_NUMBER_INVALID);
  });

  it('rejects an invalid email', () => {
    const result = customerSchema.safeParse({ ...valid, email: 'not-an-email' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_MESSAGES.EMAIL_INVALID);
  });

  it('rejects an empty full name', () => {
    const result = customerSchema.safeParse({ ...valid, fullName: '' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(VALIDATION_MESSAGES.FULL_NAME_REQUIRED);
  });
});
