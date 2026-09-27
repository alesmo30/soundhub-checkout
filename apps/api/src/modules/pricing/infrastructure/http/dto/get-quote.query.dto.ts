import { ApiProperty } from '@nestjs/swagger';
import { MAX_QUANTITY, MUNICIPALITY_CODE_PATTERN } from '@checkout/shared/constants';
import type { QuoteQuery } from '@checkout/shared/contracts';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';

export class GetQuoteQueryDto implements QuoteQuery {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ pattern: MUNICIPALITY_CODE_PATTERN.source })
  @Matches(MUNICIPALITY_CODE_PATTERN)
  municipalityCode!: string;
}
