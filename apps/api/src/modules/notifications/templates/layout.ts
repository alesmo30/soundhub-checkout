import { BRAND_NAME, EMAIL_COLORS, EMAIL_FOOTER } from '../domain/notifications.constants';
import { escapeHtml } from './escape-html';

export interface StatusChip {
  readonly icon: string;
  readonly label: string;
  readonly backgroundColor: string;
  readonly textColor: string;
}

export interface LayoutButton {
  readonly label: string;
  readonly url: string;
}

export interface AmountRow {
  readonly label: string;
  readonly value: string;
  readonly emphasize?: boolean;
}

export interface LayoutLinks {
  readonly orderUrl: string;
  readonly retryUrl: string;
}

// Each status template resolves the button for its own kind ("go see the
// order" vs. "try again"), so it alone owns the label and which URL it uses.
export interface StatusTemplateMeta {
  readonly subject: (reference: string) => string;
  readonly chip: StatusChip;
  readonly leadLine: (firstName: string) => string;
  readonly button: (links: LayoutLinks | null) => LayoutButton | null;
}

export interface LayoutData {
  readonly chip: StatusChip;
  readonly leadLine: string;
  readonly reference: string;
  readonly productName: string;
  readonly quantity: number;
  readonly amounts: readonly AmountRow[];
  readonly cardLabel: string;
  readonly deliveryStatusLabel: string;
  readonly button: LayoutButton | null;
}

export interface LayoutContent {
  readonly html: string;
  readonly text: string;
}

export function renderLayout(data: LayoutData): LayoutContent {
  return { html: buildHtml(data), text: buildText(data) };
}

function buildHtml(data: LayoutData): string {
  const amountsRows = data.amounts
    .map((row) => {
      const weight = row.emphasize ? 'font-weight:700;' : '';
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid ${EMAIL_COLORS.borderSubtle};${weight}">${escapeHtml(row.label)}</td>
        <td style="padding:8px 0;border-bottom:1px solid ${EMAIL_COLORS.borderSubtle};text-align:right;${weight}">${escapeHtml(row.value)}</td>
      </tr>`;
    })
    .join('');

  const buttonHtml = data.button
    ? `<tr><td style="padding-top:24px;">
        <a href="${escapeHtml(data.button.url)}" style="display:inline-block;background:${EMAIL_COLORS.ink};color:${EMAIL_COLORS.brandLime};text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px;">${escapeHtml(data.button.label)}</a>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:0;background:${EMAIL_COLORS.surface};font-family:Arial,Helvetica,sans-serif;color:${EMAIL_COLORS.ink};">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;margin:0 auto;">
      <tr>
        <td style="background:${EMAIL_COLORS.ink};padding:24px;text-align:center;">
          <span style="color:${EMAIL_COLORS.brandLime};font-size:20px;font-weight:700;">${escapeHtml(BRAND_NAME)}</span>
        </td>
      </tr>
      <tr>
        <td style="background:${EMAIL_COLORS.surface};padding:24px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:${data.chip.backgroundColor};color:${data.chip.textColor};padding:6px 12px;border-radius:999px;font-weight:700;font-size:14px;">${escapeHtml(data.chip.icon)} ${escapeHtml(data.chip.label)}</td>
            </tr>
          </table>
          <p style="font-size:16px;line-height:1.5;">${escapeHtml(data.leadLine)}</p>
          <p style="font-family:'Courier New',monospace;font-size:14px;">${escapeHtml(data.reference)}</p>
          <p style="font-size:14px;">${escapeHtml(data.productName)} × ${data.quantity}</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-top:16px;">${amountsRows}</table>
          <p style="font-size:14px;margin-top:16px;">${escapeHtml(data.cardLabel)}</p>
          <p style="font-size:14px;">${escapeHtml(data.deliveryStatusLabel)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0">${buttonHtml}</table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;text-align:center;font-size:12px;color:${EMAIL_COLORS.ink};">${escapeHtml(EMAIL_FOOTER)}</td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildText(data: LayoutData): string {
  const lines = [
    `${data.chip.icon} ${data.chip.label}`,
    '',
    data.leadLine,
    '',
    `Referencia: ${data.reference}`,
    `${data.productName} x ${data.quantity}`,
    '',
    ...data.amounts.map((row) => `${row.label}: ${row.value}`),
    '',
    data.cardLabel,
    data.deliveryStatusLabel,
  ];

  if (data.button) {
    lines.push('', `${data.button.label}: ${data.button.url}`);
  }

  lines.push('', EMAIL_FOOTER);

  return lines.join('\n');
}
