import type { ResultAsync } from '../../../../shared/domain/result';

export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSendError {
  readonly message: string;
}

export interface EmailSender {
  send(message: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): ResultAsync<void, EmailSendError>;
}
