import { customerSchema } from '@checkout/shared/validation';

describe('@checkout/shared resolution in Jest', () => {
  it('imports and runs validation logic from the shared TypeScript source', () => {
    const result = customerSchema.safeParse({
      documentNumber: '1234567890',
      fullName: 'Juan Pérez',
      email: 'juan@example.com',
      phone: '3001234567',
    });

    expect(result.success).toBe(true);
  });
});
