import { ApiProperty } from '@nestjs/swagger';
import type { Cents, Currency, Quote } from '@checkout/shared/contracts';
import { FeeRule } from '@checkout/shared/enums';

type QuoteProduct = Quote['product'];
type QuoteWarehouse = Quote['delivery']['warehouse'];
type QuoteDelivery = Quote['delivery'];

export class QuoteProductDto implements QuoteProduct {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unitPriceInCents!: Cents;
}

export class QuoteWarehouseDto implements QuoteWarehouse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class QuoteDeliveryDto implements QuoteDelivery {
  @ApiProperty()
  feeInCents!: Cents;

  @ApiProperty({ enum: Object.values(FeeRule) })
  rule!: FeeRule;

  @ApiProperty()
  distanceKm!: number;

  @ApiProperty({ type: QuoteWarehouseDto })
  warehouse!: QuoteWarehouse;
}

export class QuoteDto implements Quote {
  @ApiProperty({ type: QuoteProductDto })
  product!: QuoteProduct;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  subtotalInCents!: Cents;

  @ApiProperty()
  vatIncludedInCents!: Cents;

  @ApiProperty()
  baseFeeInCents!: Cents;

  @ApiProperty({ type: QuoteDeliveryDto })
  delivery!: QuoteDelivery;

  @ApiProperty()
  totalInCents!: Cents;

  @ApiProperty()
  currency!: Currency;
}
