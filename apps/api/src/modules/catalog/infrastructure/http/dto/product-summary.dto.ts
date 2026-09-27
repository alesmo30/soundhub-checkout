import { ApiProperty } from '@nestjs/swagger';
import type { Cents, Currency, ProductSummary } from '@checkout/shared/contracts';

export class ProductSummaryDto implements ProductSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sku!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  brand!: string;

  @ApiProperty()
  priceInCents!: Cents;

  @ApiProperty()
  currency!: Currency;

  @ApiProperty()
  imageUrl!: string;

  @ApiProperty()
  stockAvailable!: number;
}
