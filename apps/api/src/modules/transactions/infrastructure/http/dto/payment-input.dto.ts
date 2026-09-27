import { ApiProperty } from '@nestjs/swagger';
import type { PaymentInput } from '@checkout/shared/contracts';
import { CardBrand } from '@checkout/shared/enums';
import { IsEnum, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

// No shared limit fits a gateway token's length (packages/shared is out of
// this spec's scope); these bound the field to something a JWT-shaped
// acceptance/auth token or an opaque card token can never exceed in practice.
const CARD_TOKEN_MAX_LENGTH = 100;
const GATEWAY_TOKEN_MAX_LENGTH = 2_000;
const CARD_LAST4_PATTERN = /^[0-9]{4}$/;

export class PaymentInputDto implements PaymentInput {
  @ApiProperty({ maxLength: CARD_TOKEN_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CARD_TOKEN_MAX_LENGTH)
  cardToken!: string;

  @ApiProperty({ enum: CardBrand })
  @IsEnum(CardBrand)
  cardBrand!: CardBrand;

  @ApiProperty({ pattern: CARD_LAST4_PATTERN.source })
  @Matches(CARD_LAST4_PATTERN)
  cardLast4!: string;

  @ApiProperty({ maxLength: GATEWAY_TOKEN_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(GATEWAY_TOKEN_MAX_LENGTH)
  acceptanceToken!: string;

  @ApiProperty({ maxLength: GATEWAY_TOKEN_MAX_LENGTH })
  @IsString()
  @IsNotEmpty()
  @MaxLength(GATEWAY_TOKEN_MAX_LENGTH)
  personalAuthToken!: string;
}
