export interface DeployEnv {
  paymentGatewayUrl: string;
  paymentGatewayPublicKey: string;
  smtpHost: string;
  smtpPort: number;
  emailFrom: string;
}

function readRequired(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value) {
    throw new Error(`Missing deploy variable: ${name}`);
  }
  return value;
}

export function loadDeployEnv(source: Record<string, string | undefined>): DeployEnv {
  return {
    paymentGatewayUrl: readRequired(source, 'PAYMENT_GATEWAY_URL'),
    paymentGatewayPublicKey: readRequired(source, 'PAYMENT_GATEWAY_PUBLIC_KEY'),
    smtpHost: readRequired(source, 'SMTP_HOST'),
    smtpPort: Number(readRequired(source, 'SMTP_PORT')),
    emailFrom: readRequired(source, 'EMAIL_FROM'),
  };
}

// The AWS account tied to whichever CLI profile is active; the CDK CLI sets
// this from the credentials it resolves, so no profile name is hardcoded here.
export function readDeployAccount(): string | undefined {
  return process.env.CDK_DEFAULT_ACCOUNT;
}
