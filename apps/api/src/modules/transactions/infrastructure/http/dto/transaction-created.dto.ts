import { ApiProperty } from '@nestjs/swagger';
import type { Cents, Currency, TransactionCreated } from '@checkout/shared/contracts';
import { DeliveryStatus, TransactionStatus } from '@checkout/shared/enums';

class TransactionCreatedDeliveryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;
}

export class TransactionCreatedDto implements TransactionCreated {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  reference!: string;

  @ApiProperty({ enum: TransactionStatus })
  status!: TransactionStatus;

  @ApiProperty({ type: String, nullable: true })
  statusMessage!: string | null;

  @ApiProperty()
  totalInCents!: Cents;

  @ApiProperty()
  currency!: Currency;

  @ApiProperty({ type: TransactionCreatedDeliveryDto })
  delivery!: TransactionCreatedDeliveryDto;

  @ApiProperty()
  createdAt!: string;
}
