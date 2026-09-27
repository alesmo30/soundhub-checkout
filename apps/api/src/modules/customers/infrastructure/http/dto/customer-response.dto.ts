import { ApiProperty } from '@nestjs/swagger';
import type { Customer } from '@checkout/shared/contracts';

import { CustomerDto } from './customer.dto';

export class CustomerResponseDto {
  @ApiProperty({ type: CustomerDto })
  data!: Customer;
}
