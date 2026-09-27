import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ProductIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}
