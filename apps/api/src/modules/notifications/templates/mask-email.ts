export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';

  return `${local.slice(0, 1)}***@${domain}`;
}
