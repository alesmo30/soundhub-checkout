import { ApiProperty } from '@nestjs/swagger';
import type { PaginationMeta } from '@checkout/shared/contracts';

export class PaginationMetaDto implements PaginationMeta {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  totalItems!: number;

  @ApiProperty()
  totalPages!: number;
}
