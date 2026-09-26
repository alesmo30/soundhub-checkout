import { z } from 'zod';
import {
  PHONE_PATTERN,
  DEPARTMENT_CODE_PATTERN,
  MUNICIPALITY_CODE_PATTERN,
  FULL_NAME_MAX_LENGTH,
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_DETAIL_MAX_LENGTH,
} from '../constants';
import { VALIDATION_MESSAGES } from './messages';

export const deliverySchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(1, VALIDATION_MESSAGES.RECIPIENT_NAME_REQUIRED)
    .max(FULL_NAME_MAX_LENGTH, VALIDATION_MESSAGES.RECIPIENT_NAME_REQUIRED),
  phone: z.string().trim().regex(PHONE_PATTERN, VALIDATION_MESSAGES.PHONE_INVALID),
  departmentCode: z
    .string()
    .trim()
    .regex(DEPARTMENT_CODE_PATTERN, VALIDATION_MESSAGES.DEPARTMENT_REQUIRED),
  municipalityCode: z
    .string()
    .trim()
    .regex(MUNICIPALITY_CODE_PATTERN, VALIDATION_MESSAGES.MUNICIPALITY_REQUIRED),
  addressLine: z
    .string()
    .trim()
    .min(1, VALIDATION_MESSAGES.ADDRESS_LINE_REQUIRED)
    .max(ADDRESS_LINE_MAX_LENGTH, VALIDATION_MESSAGES.ADDRESS_LINE_REQUIRED),
  addressDetail: z
    .string()
    .trim()
    .max(ADDRESS_DETAIL_MAX_LENGTH, VALIDATION_MESSAGES.ADDRESS_DETAIL_TOO_LONG)
    .optional(),
});

export type DeliveryFormValues = z.infer<typeof deliverySchema>;
