import { ApiProperty } from '@nestjs/swagger';
import type { Municipality } from '@checkout/shared/contracts';

export class MunicipalityDto implements Municipality {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  isMetroArea!: boolean;
}
