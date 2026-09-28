import type { PipeTransform } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';

import { DomainErrorException } from '../../../../shared/infrastructure/http/domain-error.exception';
import { missingIdempotencyKey } from '../../domain/transaction.errors';

// Runs before the body DTO validates, so a missing/malformed key never even
// reaches CreateTransactionUseCase (see the "Idempotency" HTTP table in
// specs/08-api-create-transaction.md).
@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string | undefined, string> {
  transform(value: string | undefined): string {
    if (!value || !isUUID(value, '4')) {
      throw new DomainErrorException(missingIdempotencyKey());
    }

    return value;
  }
}
