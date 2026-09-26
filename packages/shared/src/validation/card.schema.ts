import { z } from 'zod';
import { isSupportedBrandPrefix } from './card-brand';
import { isValidLuhn } from './luhn';
import { checkExpiry } from './card-expiry';
import { VALIDATION_MESSAGES } from './messages';

// Card-only limits: the api never sees card data, so these stay local
// instead of living in the shared constants.
const CARD_NUMBER_LENGTH = 16;
const CARD_HOLDER_MIN_LENGTH = 5;
const CARD_HOLDER_MAX_LENGTH = 60;
const CARD_HOLDER_PATTERN = /^[\p{L} ]+$/u;
const CVC_PATTERN = /^[0-9]{3}$/;
const EXPIRY_FORMAT_PATTERN = /^(0[1-9]|1[0-2])\/[0-9]{2}$/;
const INSTALLMENTS_MIN = 1;
const INSTALLMENTS_MAX = 36;

const cardNumberSchema = z
  .string()
  .transform((value) => value.replace(/\s/g, ''))
  .superRefine((digits, ctx) => {
    if (!isSupportedBrandPrefix(digits)) {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MESSAGES.CARD_BRAND_UNSUPPORTED });
      return;
    }

    if (digits.length !== CARD_NUMBER_LENGTH || !isValidLuhn(digits)) {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MESSAGES.CARD_NUMBER_INVALID });
    }
  });

const cardExpirySchema = z
  .string()
  .regex(EXPIRY_FORMAT_PATTERN, VALIDATION_MESSAGES.CARD_EXPIRY_FORMAT)
  .superRefine((value, ctx) => {
    const result = checkExpiry(value, new Date());

    if (result === 'EXPIRED') {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MESSAGES.CARD_EXPIRY_EXPIRED });
    } else if (result === 'TOO_FAR') {
      ctx.addIssue({ code: 'custom', message: VALIDATION_MESSAGES.CARD_EXPIRY_TOO_FAR });
    }
  });

export const cardSchema = z.object({
  holder: z
    .string()
    .trim()
    .min(CARD_HOLDER_MIN_LENGTH, VALIDATION_MESSAGES.CARD_HOLDER_INVALID)
    .max(CARD_HOLDER_MAX_LENGTH, VALIDATION_MESSAGES.CARD_HOLDER_INVALID)
    .regex(CARD_HOLDER_PATTERN, VALIDATION_MESSAGES.CARD_HOLDER_INVALID),
  number: cardNumberSchema,
  expiry: cardExpirySchema,
  cvc: z.string().regex(CVC_PATTERN, VALIDATION_MESSAGES.CARD_CVC_INVALID),
  installments: z
    .number()
    .int(VALIDATION_MESSAGES.CARD_INSTALLMENTS_INVALID)
    .min(INSTALLMENTS_MIN, VALIDATION_MESSAGES.CARD_INSTALLMENTS_INVALID)
    .max(INSTALLMENTS_MAX, VALIDATION_MESSAGES.CARD_INSTALLMENTS_INVALID),
});

export type CardFormValues = z.infer<typeof cardSchema>;
