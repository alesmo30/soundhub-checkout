import { ApiProperty } from '@nestjs/swagger';
import type { Department } from '@checkout/shared/contracts';

export class DepartmentDto implements Department {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}
