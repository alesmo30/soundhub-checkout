import { z } from 'zod';
import { NATIONAL_ID_PATTERN, PHONE_PATTERN, EMAIL_MAX_LENGTH, FULL_NAME_MAX_LENGTH } from '../constants';
import { VALIDATION_MESSAGES } from './messages';

export const customerSchema = z.object({
  documentNumber: z.string().trim().regex(NATIONAL_ID_PATTERN, VALIDATION_MESSAGES.DOCUMENT_NUMBER_INVALID),
  fullName: z
    .string()
    .trim()
    .min(1, VALIDATION_MESSAGES.FULL_NAME_REQUIRED)
    .max(FULL_NAME_MAX_LENGTH, VALIDATION_MESSAGES.FULL_NAME_REQUIRED),
  email: z
    .string()
    .trim()
    .max(EMAIL_MAX_LENGTH, VALIDATION_MESSAGES.EMAIL_INVALID)
    .pipe(z.email(VALIDATION_MESSAGES.EMAIL_INVALID)),
  phone: z.string().trim().regex(PHONE_PATTERN, VALIDATION_MESSAGES.PHONE_INVALID),
});

export type CustomerFormValues = z.infer<typeof customerSchema>;
