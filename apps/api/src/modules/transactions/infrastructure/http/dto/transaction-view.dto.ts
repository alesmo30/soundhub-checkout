import { ApiProperty } from '@nestjs/swagger';
import type { Cents, Currency, TransactionView } from '@checkout/shared/contracts';
import { CardBrand, DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

class TransactionViewProductDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  imageUrl!: string;
}

class TransactionViewAmountsDto {
  @ApiProperty()
  unitPriceInCents!: Cents;

  @ApiProperty()
  subtotalInCents!: Cents;

  @ApiProperty()
  baseFeeInCents!: Cents;

  @ApiProperty()
  deliveryFeeInCents!: Cents;

  @ApiProperty()
  totalInCents!: Cents;

  @ApiProperty()
  currency!: Currency;
}

class TransactionViewCardDto {
  @ApiProperty({ enum: CardBrand })
  brand!: CardBrand;

  @ApiProperty()
  last4!: string;
}

class TransactionViewDeliveryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;
}

export class TransactionViewDto implements TransactionView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ type: String, nullable: true })
  statusMessage!: string | null;

  @ApiProperty({ type: TransactionViewProductDto })
  product!: TransactionViewProductDto;

  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  installments!: number;

  @ApiProperty({ type: TransactionViewAmountsDto })
  amounts!: TransactionViewAmountsDto;

  @ApiProperty({ type: TransactionViewCardDto })
  card!: TransactionViewCardDto;

  @ApiProperty({ type: TransactionViewDeliveryDto })
  delivery!: TransactionViewDeliveryDto;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty({ type: String, nullable: true })
  finalizedAt!: string | null;
}
