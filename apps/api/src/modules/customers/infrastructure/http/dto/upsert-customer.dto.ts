import { ApiProperty } from '@nestjs/swagger';
import {
  EMAIL_MAX_LENGTH,
  FULL_NAME_MAX_LENGTH,
  NATIONAL_ID_PATTERN,
  PHONE_PATTERN,
} from '@checkout/shared/constants';
import type { UpsertCustomerRequest } from '@checkout/shared/contracts';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimAndLowerCase({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class UpsertCustomerDto implements UpsertCustomerRequest {
  @ApiProperty({ pattern: NATIONAL_ID_PATTERN.source })
  @Transform(trim)
  @Matches(NATIONAL_ID_PATTERN)
  documentNumber!: string;

  @ApiProperty({ maxLength: FULL_NAME_MAX_LENGTH })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(FULL_NAME_MAX_LENGTH)
  fullName!: string;

  @ApiProperty({ maxLength: EMAIL_MAX_LENGTH })
  @Transform(trimAndLowerCase)
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @ApiProperty({ pattern: PHONE_PATTERN.source })
  @Transform(trim)
  @Matches(PHONE_PATTERN)
  phone!: string;
}
