const SENSITIVE_KEYS = [
  'cardToken',
  'acceptanceToken',
  'personalAuthToken',
  'documentNumber',
  'email',
  'phone',
] as const;

export const REDACT_CENSOR = '[REDACTED]';

export const REDACT_PATHS: string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_KEYS.map((key) => `*.*.${key}`),
  'req.headers.authorization',
];
