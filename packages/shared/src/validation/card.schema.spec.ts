import { cardSchema } from './card.schema';
import { VALIDATION_MESSAGES } from './messages';

const FIXED_NOW = new Date(2026, 8, 15); // September 15, 2026

describe('cardSchema', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const valid = {
    holder: 'Juan Perez',
    number: '4242 4242 4242 4242',
    expiry: '09/26',
    cvc: '123',
    installments: 1,
  };

  it('accepts valid values and strips spaces from the number', () => {
    const result = cardSchema.safeParse(valid);
    expect(result.success).toBe(true);
    expect(result.success && result.data.number).toBe('4242424242424242');
  });

  it('rejects an unsupported brand prefix', () => {
    const result = cardSchema.safeParse({ ...valid, number: '3782 822463 10005' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_BRAND_UNSUPPORTED,
    );
  });

  it('rejects a number that fails Luhn', () => {
    const result = cardSchema.safeParse({ ...valid, number: '4242 4242 4242 4241' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_NUMBER_INVALID,
    );
  });

  it('accepts the current month', () => {
    expect(cardSchema.safeParse({ ...valid, expiry: '09/26' }).success).toBe(true);
  });

  it('rejects the previous month as expired', () => {
    const result = cardSchema.safeParse({ ...valid, expiry: '08/26' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_EXPIRY_EXPIRED,
    );
  });

  it('rejects a date more than 20 years ahead', () => {
    const result = cardSchema.safeParse({ ...valid, expiry: '09/47' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_EXPIRY_TOO_FAR,
    );
  });

  it('rejects a malformed expiry', () => {
    const result = cardSchema.safeParse({ ...valid, expiry: '13/26' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_EXPIRY_FORMAT,
    );
  });

  it('rejects a 4-digit CVC', () => {
    const result = cardSchema.safeParse({ ...valid, cvc: '1234' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_CVC_INVALID,
    );
  });

  it('rejects 0 installments', () => {
    const result = cardSchema.safeParse({ ...valid, installments: 0 });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_INSTALLMENTS_INVALID,
    );
  });

  it('rejects 37 installments', () => {
    const result = cardSchema.safeParse({ ...valid, installments: 37 });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_INSTALLMENTS_INVALID,
    );
  });

  it('rejects a holder shorter than 5 characters', () => {
    const result = cardSchema.safeParse({ ...valid, holder: 'Jo' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_HOLDER_INVALID,
    );
  });

  it('accepts a holder with accents and ñ', () => {
    expect(cardSchema.safeParse({ ...valid, holder: 'Andrés Muñoz' }).success).toBe(true);
  });

  it('rejects a holder with digits', () => {
    const result = cardSchema.safeParse({ ...valid, holder: 'Juan Perez 2' });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0]?.message).toBe(
      VALIDATION_MESSAGES.CARD_HOLDER_INVALID,
    );
  });
});
