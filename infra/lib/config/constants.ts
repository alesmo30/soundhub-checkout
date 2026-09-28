export const REGION = 'us-east-1';
export const STACK_PREFIX = 'Checkout';
export const PROJECT_TAG = { key: 'project', value: 'headphones-checkout' };
export const DB_NAME = 'checkout';
export const DB_INSTANCE = 'db.t4g.micro';
export const DB_STORAGE_GB = 20;
export const DB_BACKUP_DAYS = 1;
export const NAT_INSTANCE = 't4g.nano';
export const API_LAMBDA = { memoryMb: 1024, timeoutSeconds: 29, runtime: 'nodejs22.x', arch: 'arm64' };
export const MIGRATOR_LAMBDA = { memoryMb: 512, timeoutSeconds: 300 };
export const LOG_RETENTION_DAYS = 14;
export const HTTP_API_THROTTLE = { rateLimit: 50, burstLimit: 100 };
export const IMAGES_MAX_AGE_SECONDS = 31_536_000; // 1 year, immutable
export const APP_SECRET_KEYS = [
  'PAYMENT_GATEWAY_PRIVATE_KEY',
  'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET',
  'SMTP_USER',
  'SMTP_PASSWORD',
] as const;
