import type { DomainError } from '../../domain/domain-error';

export class DomainErrorException extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.detail);
    this.name = 'DomainErrorException';
  }
}
