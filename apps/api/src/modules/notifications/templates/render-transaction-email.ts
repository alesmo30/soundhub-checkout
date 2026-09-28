import type { CardBrand, DeliveryStatus } from '@checkout/shared/enums';

import { DELIVERY_STATUS_LABELS } from '../domain/notifications.constants';
import { APPROVED_TEMPLATE } from './approved';
import { DECLINED_TEMPLATE } from './declined';
import { ERROR_TEMPLATE } from './error';
import { EXPIRED_TEMPLATE } from './expired';
import { formatCop } from './format-cop';
import type { LayoutLinks, StatusTemplateMeta } from './layout';
import { renderLayout } from './layout';
import { VOIDED_TEMPLATE } from './voided';

export type FinalStatus = 'APPROVED' | 'DECLINED' | 'ERROR' | 'VOIDED' | 'EXPIRED';

export interface TransactionEmailData {
  readonly status: FinalStatus;
  readonly firstName: string;
  readonly reference: string;
  readonly productName: string;
  readonly quantity: number;
  readonly amounts: {
    readonly subtotalInCents: number;
    readonly baseFeeInCents: number;
    readonly deliveryFeeInCents: number;
    readonly totalInCents: number;
  };
  readonly card: { readonly brand: CardBrand; readonly last4: string };
  readonly deliveryStatus: DeliveryStatus;
  readonly links: LayoutLinks | null;
}

export interface TransactionEmailContent {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const STATUS_TEMPLATES: Record<FinalStatus, StatusTemplateMeta> = {
  APPROVED: APPROVED_TEMPLATE,
  DECLINED: DECLINED_TEMPLATE,
  ERROR: ERROR_TEMPLATE,
  VOIDED: VOIDED_TEMPLATE,
  EXPIRED: EXPIRED_TEMPLATE,
};

export function renderTransactionEmail(data: TransactionEmailData): TransactionEmailContent {
  const meta = STATUS_TEMPLATES[data.status];

  const { html, text } = renderLayout({
    chip: meta.chip,
    leadLine: meta.leadLine(data.firstName),
    reference: data.reference,
    productName: data.productName,
    quantity: data.quantity,
    amounts: [
      { label: 'Subtotal', value: formatCop(data.amounts.subtotalInCents) },
      { label: 'Tarifa base', value: formatCop(data.amounts.baseFeeInCents) },
      { label: 'Envío', value: formatCop(data.amounts.deliveryFeeInCents) },
      { label: 'Total', value: formatCop(data.amounts.totalInCents), emphasize: true },
    ],
    cardLabel: `${data.card.brand} •••• ${data.card.last4}`,
    deliveryStatusLabel: DELIVERY_STATUS_LABELS[data.deliveryStatus],
    button: meta.button(data.links),
  });

  return { subject: meta.subject(data.reference), html, text };
}
