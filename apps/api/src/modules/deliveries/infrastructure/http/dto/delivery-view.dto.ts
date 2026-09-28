import { ApiProperty } from '@nestjs/swagger';
import type { DeliveryView } from '@checkout/shared/contracts';
import { DeliveryStatus, FeeRule } from '@checkout/shared/enums';

class DeliveryViewWarehouseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  municipalityName!: string;
}

class DeliveryViewDestinationDto {
  @ApiProperty()
  recipientName!: string;

  @ApiProperty()
  addressLine!: string;

  @ApiProperty({ type: String, nullable: true })
  addressDetail!: string | null;

  @ApiProperty()
  municipalityName!: string;

  @ApiProperty()
  departmentName!: string;
}

export class DeliveryViewDto implements DeliveryView {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  transactionId!: string;

  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;

  @ApiProperty({ type: DeliveryViewWarehouseDto })
  warehouse!: DeliveryViewWarehouseDto;

  @ApiProperty({ type: DeliveryViewDestinationDto })
  destination!: DeliveryViewDestinationDto;

  @ApiProperty()
  distanceKm!: number;

  @ApiProperty({ enum: FeeRule })
  feeRule!: FeeRule;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
