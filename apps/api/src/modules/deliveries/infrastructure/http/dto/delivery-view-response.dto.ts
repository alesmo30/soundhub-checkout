import { ApiProperty } from '@nestjs/swagger';
import type { DeliveryView } from '@checkout/shared/contracts';

import { DeliveryViewDto } from './delivery-view.dto';

export class DeliveryViewResponseDto {
  @ApiProperty({ type: DeliveryViewDto })
  data!: DeliveryView;
}
