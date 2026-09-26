import type { ProblemDetails } from '@checkout/shared/contracts';
import type { ErrorCode } from '@checkout/shared/enums';

export function problem(status: number, code: ErrorCode, detail: string): ProblemDetails {
  return {
    type: 'about:blank',
    title: code,
    status,
    code,
    detail,
    traceId: crypto.randomUUID(),
  };
}
