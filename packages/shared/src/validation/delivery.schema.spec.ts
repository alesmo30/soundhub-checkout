import { deliverySchema } from './delivery.schema';
import { VALIDATION_MESSAGES } from './messages';

describe('deliverySchema', () => {
  const valid = {
    recipientName: 'Maria Gomez',
    phone: '3001234567',
    departmentCode: '11',
    municipalityCode: '11001',
    addressLine: 'Calle 123 #45-67',
  };

  it('accepts valid values without addressDetail', () => {
    expect(deliverySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a 4-digit municipality code', () => {
    const result = deliverySchema.safeParse({ ...valid, municipalityCode: '1100' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.MUNICIPALITY_REQUIRED,
    );
  });

  it('rejects a 201-character address', () => {
    const result = deliverySchema.safeParse({ ...valid, addressLine: 'a'.repeat(201) });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.ADDRESS_LINE_REQUIRED,
    );
  });

  it('rejects a department code with the wrong length', () => {
    const result = deliverySchema.safeParse({ ...valid, departmentCode: '1' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.DEPARTMENT_REQUIRED,
    );
  });

  it('rejects an addressDetail longer than 120 characters', () => {
    const result = deliverySchema.safeParse({ ...valid, addressDetail: 'a'.repeat(121) });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.ADDRESS_DETAIL_TOO_LONG,
    );
  });
});
