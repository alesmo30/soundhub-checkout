import { Inject, Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';

import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { ResultAsync } from '../../../shared/domain/result';
import type { EmailSendError, EmailSender } from '../application/ports/email-sender.port';

const SEND_TIMEOUT_MS = 10_000;

@Injectable()
export class NodemailerGmailAdapter implements EmailSender {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) appConfig: AppConfig) {
    this.from = appConfig.smtp.from;
    this.transporter = createTransport({
      host: appConfig.smtp.host,
      port: appConfig.smtp.port,
      secure: true,
      auth: { user: appConfig.smtp.user, pass: appConfig.smtp.password },
      pool: false,
      connectionTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }

  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): ResultAsync<void, EmailSendError> {
    const promise = this.transporter
      .sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
      .then(() => undefined);

    // The error is folded to a bare message: a raw SMTP error can carry the
    // recipient or connection details in its stack, which must never be
    // logged (see acceptance criteria > Security and logging).
    return ResultAsync.fromPromise(promise, (): EmailSendError => ({
      message: 'Failed to send email through SMTP',
    }));
  }
}
