import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ProductRepository } from '../../../catalog';
import type { CustomerRepository } from '../../../customers';
import type { DeliveryRepository } from '../../../deliveries';
import type { FinalStatus, Transaction, TransactionRepository } from '../../../transactions';
import type { UnitOfWork } from '../../../../shared/application/ports/unit-of-work.port';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import { renderTransactionEmail } from '../../templates/render-transaction-email';
import type { TransactionEmailData } from '../../templates/render-transaction-email';
import type { EmailSendError, EmailSender } from '../ports/email-sender.port';

export type SendEmailOutcome = 'SENT' | 'ALREADY_SENT' | 'SKIPPED';

// Bundles the use case's 6 collaborators behind one DI token (same pattern
// as transactions' FINALIZE_TRANSACTION_DEPENDENCIES — see
// references/coding-conventions.md#c1). notifications.module.ts builds this
// object from the individually wired repositories, EMAIL_SENDER,
// UNIT_OF_WORK and APP_CONFIG.web.publicUrl.
export const SEND_TRANSACTION_EMAIL_DEPENDENCIES = Symbol('SEND_TRANSACTION_EMAIL_DEPENDENCIES');

export interface SendTransactionEmailDependencies {
  readonly transactionRepository: TransactionRepository;
  readonly customerRepository: CustomerRepository;
  readonly productRepository: ProductRepository;
  readonly deliveryRepository: DeliveryRepository;
  readonly emailSender: EmailSender;
  readonly unitOfWork: UnitOfWork;
  readonly publicWebUrl: string | null;
}

@Injectable()
export class SendTransactionEmailUseCase {
  private readonly logger = new Logger(SendTransactionEmailUseCase.name);

  constructor(
    @Inject(SEND_TRANSACTION_EMAIL_DEPENDENCIES)
    private readonly deps: SendTransactionEmailDependencies,
  ) {}

  execute(transactionId: string): ResultAsync<SendEmailOutcome, EmailSendError> {
    return this.deps.transactionRepository.findById(transactionId).andThen((transaction) => {
      if (!transaction) {
        this.logger.error(`email skipped, transaction not found: ${transactionId}`);
        return okAsync<SendEmailOutcome, EmailSendError>('SKIPPED');
      }
      if (transaction.status === 'PENDING') {
        this.logger.warn(`email skipped, transaction still pending: ${transactionId}`);
        return okAsync<SendEmailOutcome, EmailSendError>('SKIPPED');
      }
      if (transaction.emailSentAt) {
        return okAsync<SendEmailOutcome, EmailSendError>('ALREADY_SENT');
      }

      return this.loadAndSend(transaction);
    });
  }

  private loadAndSend(transaction: Transaction): ResultAsync<SendEmailOutcome, EmailSendError> {
    const { customerRepository, productRepository, deliveryRepository } = this.deps;

    return ResultAsync.combine([
      customerRepository.findById(transaction.customerId),
      productRepository.findById(transaction.productId),
      deliveryRepository.findByTransactionId(transaction.id),
    ]).andThen(([customer, product, delivery]) => {
      if (!customer) {
        return errAsync<SendEmailOutcome, EmailSendError>({
          message: `customer not found for transaction ${transaction.id}`,
        });
      }
      if (!product) {
        return errAsync<SendEmailOutcome, EmailSendError>({
          message: `product not found for transaction ${transaction.id}`,
        });
      }
      if (!delivery) {
        return errAsync<SendEmailOutcome, EmailSendError>({
          message: `delivery not found for transaction ${transaction.id}`,
        });
      }

      const emailData: TransactionEmailData = {
        // Safe: PENDING already returned SKIPPED above, so this is a FinalStatus.
        status: transaction.status as FinalStatus,
        firstName: customer.fullName.split(' ')[0] ?? customer.fullName,
        reference: transaction.reference,
        productName: product.name,
        quantity: transaction.quantity,
        amounts: {
          subtotalInCents: transaction.subtotalInCents,
          baseFeeInCents: transaction.baseFeeInCents,
          deliveryFeeInCents: transaction.deliveryFeeInCents,
          totalInCents: transaction.totalInCents,
        },
        card: { brand: transaction.cardBrand, last4: transaction.cardLast4 },
        deliveryStatus: delivery.status,
        links: this.deps.publicWebUrl
          ? {
              orderUrl: `${this.deps.publicWebUrl}/transactions/${transaction.id}`,
              retryUrl: `${this.deps.publicWebUrl}/products/${transaction.productId}`,
            }
          : null,
      };

      const content = renderTransactionEmail(emailData);

      return this.deps.emailSender
        .send({
          to: customer.email,
          subject: content.subject,
          html: content.html,
          text: content.text,
        })
        .andThen(() =>
          this.deps.unitOfWork.run((tx) =>
            this.deps.transactionRepository.markEmailSent(tx, transaction.id),
          ),
        )
        .map((): SendEmailOutcome => 'SENT');
    });
  }
}
