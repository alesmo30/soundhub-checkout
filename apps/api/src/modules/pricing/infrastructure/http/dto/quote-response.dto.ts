import { ApiProperty } from '@nestjs/swagger';
import type { Quote } from '@checkout/shared/contracts';

import { QuoteDto } from './quote.dto';

export class QuoteResponseDto {
  @ApiProperty({ type: QuoteDto })
  data!: Quote;
}
