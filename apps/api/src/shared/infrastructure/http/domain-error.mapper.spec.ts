import { ErrorCode } from '@checkout/shared/enums';

import { DomainError, type ErrorKind } from '../../domain/domain-error';
import { DomainErrorMapper } from './domain-error.mapper';

describe('DomainErrorMapper', () => {
  it.each<[ErrorKind, number]>([
    ['VALIDATION', 400],
    ['UNAUTHORIZED', 401],
    ['NOT_FOUND', 404],
    ['CONFLICT', 409],
    ['UNPROCESSABLE', 422],
    ['RATE_LIMITED', 429],
    ['UNAVAILABLE', 503],
  ])('maps kind %s to status %i', (kind, status) => {
    const error = new DomainError(ErrorCode.INTERNAL_ERROR, kind, 'detail');

    expect(DomainErrorMapper.toHttpStatus(error)).toBe(status);
  });

  it('maps the same code to different statuses depending on kind', () => {
    const notFound = new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'on a path param');
    const unprocessable = new DomainError(
      ErrorCode.PRODUCT_NOT_FOUND,
      'UNPROCESSABLE',
      'in a quote body',
    );

    expect(DomainErrorMapper.toHttpStatus(notFound)).toBe(404);
    expect(DomainErrorMapper.toHttpStatus(unprocessable)).toBe(422);
  });

  it('returns a fixed title for every ErrorCode', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(DomainErrorMapper.toTitle(code)).toBeTruthy();
    }
  });
});
