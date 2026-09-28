import { ApiProperty } from '@nestjs/swagger';
import {
  ADDRESS_DETAIL_MAX_LENGTH,
  ADDRESS_LINE_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  MUNICIPALITY_CODE_PATTERN,
  PHONE_PATTERN,
} from '@checkout/shared/constants';
import type { DeliveryInput } from '@checkout/shared/contracts';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DeliveryInputDto implements DeliveryInput {
  @ApiProperty({ maxLength: FULL_NAME_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(FULL_NAME_MAX_LENGTH)
  recipientName!: string;

  @ApiProperty({ pattern: PHONE_PATTERN.source })
  @Matches(PHONE_PATTERN)
  phone!: string;

  @ApiProperty({ maxLength: ADDRESS_LINE_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(ADDRESS_LINE_MAX_LENGTH)
  addressLine!: string;

  @ApiProperty({ maxLength: ADDRESS_DETAIL_MAX_LENGTH, required: false })
  @IsOptional()
  @IsString()
  @MaxLength(ADDRESS_DETAIL_MAX_LENGTH)
  addressDetail?: string;

  @ApiProperty({ pattern: MUNICIPALITY_CODE_PATTERN.source })
  @Matches(MUNICIPALITY_CODE_PATTERN)
  municipalityCode!: string;
}
