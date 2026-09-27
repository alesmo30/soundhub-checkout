import { ApiProperty } from '@nestjs/swagger';
import type { TransactionCreated } from '@checkout/shared/contracts';

import { TransactionCreatedDto } from './transaction-created.dto';

export class TransactionCreatedResponseDto {
  @ApiProperty({ type: TransactionCreatedDto })
  data!: TransactionCreated;
}
