import { createHash } from 'node:crypto';

export interface IntegritySignatureInput {
  readonly reference: string;
  readonly amountInCents: number;
  readonly currency: string;
  readonly secret: string;
}

// Plain concatenation and SHA-256, per the payment gateway's integrity
// signature scheme: reference + amountInCents + currency + secret.
export function integritySignature(input: IntegritySignatureInput): string {
  const { reference, amountInCents, currency, secret } = input;

  return createHash('sha256')
    .update(`${reference}${amountInCents}${currency}${secret}`)
    .digest('hex');
}
