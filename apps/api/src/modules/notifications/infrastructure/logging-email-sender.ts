import { Injectable, Logger } from '@nestjs/common';

import { okAsync, ResultAsync } from '../../../shared/domain/result';
import type { EmailSendError, EmailSender } from '../application/ports/email-sender.port';
import { maskEmail } from '../templates/mask-email';

@Injectable()
export class LoggingEmailSender implements EmailSender {
  private readonly logger = new Logger(LoggingEmailSender.name);

  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): ResultAsync<void, EmailSendError> {
    this.logger.log(`email to ${maskEmail(message.to)}: ${message.subject}\n${message.text}`);
    return okAsync(undefined);
  }
}
