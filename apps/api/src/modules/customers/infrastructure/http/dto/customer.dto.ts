import { ApiProperty } from '@nestjs/swagger';
import type { Customer } from '@checkout/shared/contracts';

export class CustomerDto implements Customer {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  documentNumber!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  phone!: string;
}
