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
  // The webhook's checksum header: pino-http's default req serializer logs
  // every request header, and this one must never appear in a log line
  // (spec 12a's webhook decisions).
  'req.headers["x-event-checksum"]',
];
