import { ApiProperty } from '@nestjs/swagger';
import type { Cents, ProductDetail } from '@checkout/shared/contracts';

import { ProductSummaryDto } from './product-summary.dto';

export class ProductDetailDto extends ProductSummaryDto implements ProductDetail {
  @ApiProperty()
  description!: string;

  @ApiProperty()
  vatIncludedInCents!: Cents;

  @ApiProperty()
  maxPurchaseQuantity!: number;
}
