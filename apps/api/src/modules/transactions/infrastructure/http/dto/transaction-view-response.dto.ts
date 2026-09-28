import { ApiProperty } from '@nestjs/swagger';
import type { TransactionView } from '@checkout/shared/contracts';

import { TransactionViewDto } from './transaction-view.dto';

export class TransactionViewResponseDto {
  @ApiProperty({ type: TransactionViewDto })
  data!: TransactionView;
}
