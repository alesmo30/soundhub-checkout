import { ApiProperty } from '@nestjs/swagger';
import { INSTALLMENTS_MAX, INSTALLMENTS_MIN, MAX_QUANTITY } from '@checkout/shared/constants';
import type {
  Cents,
  CreateTransactionRequest,
  DeliveryInput,
  PaymentInput,
} from '@checkout/shared/contracts';
import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min, Max, ValidateNested } from 'class-validator';

import { DeliveryInputDto } from './delivery-input.dto';
import { PaymentInputDto } from './payment-input.dto';

// payment/delivery are typed on the @checkout/shared/contracts interfaces
// rather than the sibling DTO classes: the @nestjs/swagger CLI plugin's AOT
// metadata factory resolves a *relative* class-typed property through its
// ESM-lazy-import path, which the Nest CLI's CommonJS webpack build cannot
// follow (same issue and fix as product-responses.dto.ts). @Type() still
// drives validation/transformation and @ApiProperty's `type` still drives
// the schema.

export class CreateTransactionDto implements CreateTransactionRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  productId!: string;

  @ApiProperty({ minimum: 1, maximum: MAX_QUANTITY })
  @IsInt()
  @Min(1)
  @Max(MAX_QUANTITY)
  quantity!: number;

  @ApiProperty({ minimum: INSTALLMENTS_MIN, maximum: INSTALLMENTS_MAX })
  @IsInt()
  @Min(INSTALLMENTS_MIN)
  @Max(INSTALLMENTS_MAX)
  installments!: number;

  @ApiProperty({ description: 'The total the user saw; the server recomputes it and compares.' })
  @IsInt()
  @Min(1)
  expectedTotalInCents!: Cents;

  @ApiProperty({ type: PaymentInputDto })
  @ValidateNested()
  @Type(() => PaymentInputDto)
  payment!: PaymentInput;

  @ApiProperty({ type: DeliveryInputDto })
  @ValidateNested()
  @Type(() => DeliveryInputDto)
  delivery!: DeliveryInput;
}
