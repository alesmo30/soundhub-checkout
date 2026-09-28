import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class TransactionIdParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  id!: string;
}
