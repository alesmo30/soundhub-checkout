import { Body, Controller, Headers, HttpStatus, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from '@checkout/shared/contracts';
import type { TransactionCreated } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import type { Response } from 'express';

import { DomainErrorException } from '../../../../shared/infrastructure/http/domain-error.exception';
import type { CreateTransactionCommand } from '../../application/use-cases/create-transaction.use-case';
import { CreateTransactionUseCase } from '../../application/use-cases/create-transaction.use-case';
import { requestHash } from '../../domain/request-hash';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { TransactionCreatedResponseDto } from './dto/transaction-created-response.dto';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import {
  GATEWAY_UNAVAILABLE_RETRY_AFTER_SECONDS,
  TRANSACTIONS_CACHE_CONTROL,
} from './transactions-http.constants';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly createTransactionUseCase: CreateTransactionUseCase,
    private readonly idempotencyKeyPipe: IdempotencyKeyPipe,
  ) {}

  // respond() isn't used here: Retry-After must appear only on the 503
  // breaker-open response, never on a 400/409/422, so the error is inspected
  // before it becomes a thrown DomainErrorException, and the header is set
  // on the response object beforehand — @Header() would apply to every
  // response, success or not (see customers.controller.ts's Cache-Control
  // comment for the same technique used the other way around).
  //
  // @Headers() in this Nest version only takes a property name, not pipes
  // (unlike @Query()/@Param()/@Body()), so the raw header value is read here
  // and IdempotencyKeyPipe is applied explicitly instead of declaratively.
  @Post()
  @ApiHeader({ name: IDEMPOTENCY_KEY_HEADER, required: true, description: 'A uuid v4.' })
  @ApiCreatedResponse({
    description: 'The transaction was created, or replayed from a prior identical request.',
    type: TransactionCreatedResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'MISSING_IDEMPOTENCY_KEY, or the body is malformed or has an unknown field.',
  })
  @ApiConflictResponse({ description: 'OUT_OF_STOCK or PRICE_CHANGED.' })
  @ApiUnprocessableEntityResponse({
    description:
      'IDEMPOTENCY_KEY_REUSED, or an unknown customerId/productId/municipalityCode.',
  })
  @ApiServiceUnavailableResponse({ description: 'PAYMENT_GATEWAY_UNAVAILABLE.' })
  async create(
    @Headers(IDEMPOTENCY_KEY_HEADER) rawIdempotencyKey: string | undefined,
    @Body() dto: CreateTransactionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: TransactionCreated }> {
    const idempotencyKey = this.idempotencyKeyPipe.transform(rawIdempotencyKey);
    const command: CreateTransactionCommand = {
      idempotencyKey,
      requestHash: requestHash(dto),
      customerId: dto.customerId,
      productId: dto.productId,
      quantity: dto.quantity,
      installments: dto.installments,
      expectedTotalInCents: dto.expectedTotalInCents,
      payment: dto.payment,
      delivery: dto.delivery,
    };

    const outcome = await this.createTransactionUseCase.execute(command);

    return outcome.match(
      (value) => {
        response.header('Location', `/api/v1/transactions/${value.view.id}`);
        response.header('Cache-Control', TRANSACTIONS_CACHE_CONTROL);
        if (value.replayed) {
          response.header(IDEMPOTENT_REPLAYED_HEADER, 'true');
        }
        response.status(HttpStatus.CREATED);
        return { data: value.view };
      },
      (error) => {
        if (error.code === ErrorCode.PAYMENT_GATEWAY_UNAVAILABLE) {
          response.header('Retry-After', String(GATEWAY_UNAVAILABLE_RETRY_AFTER_SECONDS));
        }
        throw new DomainErrorException(error);
      },
    );
  }
}
