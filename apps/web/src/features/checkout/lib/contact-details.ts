import { z } from 'zod';
import {
  customerSchema,
  deliverySchema,
  type CustomerFormValues,
  type DeliveryFormValues,
} from '@checkout/shared/validation';

export type DeliveryAddress = Omit<DeliveryFormValues, 'recipientName' | 'phone'>;

export interface ContactDetails {
  customer: CustomerFormValues;
  address: DeliveryAddress;
}

// The recipient is always the customer (see specs/07-web-checkout.md#decisions);
// the address section drops the fields the delivery schema only needs for a
// separate recipient.
const addressSchema = deliverySchema.omit({ recipientName: true, phone: true });

export const contactFormSchema = z.object({
  customer: customerSchema,
  address: addressSchema,
});

export function toDeliveryValues(details: ContactDetails): DeliveryFormValues {
  return {
    ...details.address,
    recipientName: details.customer.fullName,
    phone: details.customer.phone,
  };
}
