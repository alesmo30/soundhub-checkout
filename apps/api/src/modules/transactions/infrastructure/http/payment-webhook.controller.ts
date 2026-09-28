import { Body, Controller, Headers, HttpCode, HttpStatus, Inject, Logger, Post } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';

import { APP_CONFIG, type AppConfig } from '../../../../config/app-config';
import { DomainErrorException } from '../../../../shared/infrastructure/http/domain-error.exception';
import { eventChecksum, isValidChecksum } from '../../domain/event-checksum';
import { invalidSignature } from '../../domain/transaction.errors';
import type { HandlePaymentWebhookResult } from '../../application/use-cases/handle-payment-webhook.use-case';
import { HandlePaymentWebhookUseCase } from '../../application/use-cases/handle-payment-webhook.use-case';
import { EVENT_CHECKSUM_HEADER } from './transactions-http.constants';
import { parsePaymentEvent } from './payment-webhook.parser';
import { toWebhookTransactionStatus } from './to-webhook-transaction-status';

@Controller('webhooks')
export class PaymentWebhookController {
  private readonly logger = new Logger(PaymentWebhookController.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly handlePaymentWebhookUseCase: HandlePaymentWebhookUseCase,
  ) {}

  // The body is read as `unknown`, never through a DTO: the global
  // ValidationPipe's forbidNonWhitelisted must not reject fields the gateway
  // adds later (references/coding-conventions.md, this spec's webhook
  // decisions). Always 200 once the checksum is valid, even when the event
  // changes nothing — the gateway does not distinguish "handled" from
  // "ignored".
  // Not documented in Swagger: the gateway is the only caller, and the
  // endpoint is excluded from the shared test account's throttler in a later
  // spec (api 07), not here.
  @ApiExcludeEndpoint()
  @Post('payments')
  @HttpCode(HttpStatus.OK)
  async receive(
    @Body() body: unknown,
    @Headers(EVENT_CHECKSUM_HEADER) checksumHeader: string | undefined,
  ): Promise<{ data: { received: true } }> {
    const parsed = parsePaymentEvent(body);
    if (!parsed || !checksumHeader) {
      throw new DomainErrorException(invalidSignature());
    }

    const expectedChecksum = eventChecksum({
      data: parsed.data,
      properties: parsed.signature.properties,
      timestamp: parsed.timestamp,
      secret: this.config.paymentGateway.eventsSecret,
    });

    if (!isValidChecksum(expectedChecksum, checksumHeader)) {
      throw new DomainErrorException(invalidSignature());
    }

    const outcome = await this.handlePaymentWebhookUseCase.execute({
      type: parsed.event,
      providerTransactionId: parsed.providerTransactionId,
      status: toWebhookTransactionStatus(parsed.providerStatus),
      statusMessage: parsed.statusMessage,
    });

    // Never logs the body, the checksum or the secret — only what identifies
    // the event and its outcome (references/coding-conventions.md#c10).
    this.logOutcome(parsed.event, parsed.providerTransactionId, outcome._unsafeUnwrap());

    return { data: { received: true } };
  }

  private logOutcome(
    eventType: string,
    providerTransactionId: string,
    outcome: HandlePaymentWebhookResult,
  ): void {
    this.logger.log({ eventType, providerTransactionId, outcome });
  }
}
