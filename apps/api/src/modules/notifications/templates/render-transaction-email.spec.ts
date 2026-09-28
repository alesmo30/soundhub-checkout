import {
  buildSampleEmailData,
  SAMPLE_CUSTOMER_PII,
  SAMPLE_DELIVERY_ADDRESS,
  SAMPLE_LINKS,
} from './__fixtures__/sample-email-data';
import type { FinalStatus } from './render-transaction-email';
import { renderTransactionEmail } from './render-transaction-email';

const STATUS_EXPECTATIONS: Record<
  FinalStatus,
  { subject: string; chipLabel: string; leadLineContains: string }
> = {
  APPROVED: {
    subject: '¡Tu pago fue aprobado! · TX-2026-000123',
    chipLabel: 'Aprobado',
    leadLineContains: 'Recibimos tu pago y tu pedido ya está listo para envío',
  },
  DECLINED: {
    subject: 'Tu pago fue rechazado · TX-2026-000123',
    chipLabel: 'Rechazado',
    leadLineContains: 'Tu banco rechazó el pago',
  },
  ERROR: {
    subject: 'No pudimos procesar tu pago · TX-2026-000123',
    chipLabel: 'Error',
    leadLineContains: 'Hubo un problema al procesar tu pago',
  },
  VOIDED: {
    subject: 'Tu pago fue anulado · TX-2026-000123',
    chipLabel: 'Anulado',
    leadLineContains: 'El pago fue anulado',
  },
  EXPIRED: {
    subject: 'Tu pago no se completó · TX-2026-000123',
    chipLabel: 'No completado',
    leadLineContains: 'Tu pago no se completó',
  },
};

describe('renderTransactionEmail', () => {
  it.each(Object.entries(STATUS_EXPECTATIONS))(
    '%s renders its subject, chip label and lead line',
    (status, expected) => {
      const content = renderTransactionEmail(
        buildSampleEmailData({ status: status as FinalStatus }),
      );

      expect(content.subject).toBe(expected.subject);
      expect(content.html).toContain(expected.chipLabel);
      expect(content.html).toContain(expected.leadLineContains);
      expect(content.text).toContain(expected.chipLabel);
      expect(content.text).toContain(expected.leadLineContains);
    },
  );

  it('formats every amount in COP in both html and text', () => {
    const content = renderTransactionEmail(buildSampleEmailData());

    expect(content.html).toContain('$ 3.500.000');
    expect(content.html).toContain('$ 300.000');
    expect(content.html).toContain('$ 120.460');
    expect(content.html).toContain('$ 3.920.460');
    expect(content.text).toContain('$ 3.920.460');
  });

  it('shows the card brand and masked last4', () => {
    const content = renderTransactionEmail(buildSampleEmailData());

    expect(content.html).toContain('VISA •••• 4242');
    expect(content.text).toContain('VISA •••• 4242');
  });

  it('escapes a product name carrying HTML and an ampersand', () => {
    const content = renderTransactionEmail(
      buildSampleEmailData({ productName: '<script>alert(1)</script> & Co.' }),
    );

    expect(content.html).not.toContain('<script>alert(1)</script>');
    expect(content.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co.');
    expect(content.text).toContain('<script>alert(1)</script> & Co.');
  });

  it('shows the order button for APPROVED when links are present', () => {
    const content = renderTransactionEmail(buildSampleEmailData({ status: 'APPROVED' }));

    expect(content.html).toContain(SAMPLE_LINKS.orderUrl);
    expect(content.html).toContain('Ver mi pedido');
    expect(content.text).toContain(SAMPLE_LINKS.orderUrl);
  });

  it.each(['DECLINED', 'ERROR', 'VOIDED', 'EXPIRED'] as const)(
    'shows the retry button for %s when links are present',
    (status) => {
      const content = renderTransactionEmail(buildSampleEmailData({ status }));

      expect(content.html).toContain(SAMPLE_LINKS.retryUrl);
      expect(content.html).toContain('Intentar de nuevo');
      expect(content.text).toContain(SAMPLE_LINKS.retryUrl);
    },
  );

  it.each(['APPROVED', 'DECLINED', 'ERROR', 'VOIDED', 'EXPIRED'] as const)(
    'omits the button entirely for %s when links is null',
    (status) => {
      const content = renderTransactionEmail(buildSampleEmailData({ status, links: null }));

      expect(content.html).not.toContain('href=');
      expect(content.text).not.toContain('http');
    },
  );

  it('never includes the national ID, email, phone or delivery address', () => {
    const content = renderTransactionEmail(buildSampleEmailData());

    for (const piiValue of Object.values(SAMPLE_CUSTOMER_PII)) {
      expect(content.html).not.toContain(piiValue);
      expect(content.text).not.toContain(piiValue);
    }
    expect(content.html).not.toContain(SAMPLE_DELIVERY_ADDRESS);
    expect(content.text).not.toContain(SAMPLE_DELIVERY_ADDRESS);
  });

  it('chooses the template by the stored status, not any other input', () => {
    const approved = renderTransactionEmail(buildSampleEmailData({ status: 'APPROVED' }));
    const declined = renderTransactionEmail(buildSampleEmailData({ status: 'DECLINED' }));

    expect(approved.subject).not.toBe(declined.subject);
  });
});
