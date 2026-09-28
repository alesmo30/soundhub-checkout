import type { AppConfig } from '../../config/app-config';
import { LoggingEmailSender } from './infrastructure/logging-email-sender';
import { NodemailerGmailAdapter } from './infrastructure/nodemailer-gmail.adapter';
import { selectEmailSender } from './notifications.module';

function buildAppConfig(emailDriver: 'log' | 'smtp'): AppConfig {
  return {
    smtp: {
      host: 'smtp.gmail.com',
      port: 465,
      user: 'no-reply@example.com',
      password: 'pass',
      from: 'SoundHub <no-reply@example.com>',
    },
    email: { driver: emailDriver },
  } as AppConfig;
}

// NotificationsModule wires SendTransactionEmailUseCase across real,
// TypeORM-backed sibling modules, so it needs a live DataSource to compile
// end to end — that is exercised by the int-spec (step 6), not here. This
// spec covers the pure EMAIL_SENDER driver selection in isolation.
describe('selectEmailSender', () => {
  it('resolves LoggingEmailSender for the log driver', () => {
    expect(selectEmailSender(buildAppConfig('log'))).toBeInstanceOf(LoggingEmailSender);
  });

  it('resolves NodemailerGmailAdapter for the smtp driver', () => {
    expect(selectEmailSender(buildAppConfig('smtp'))).toBeInstanceOf(NodemailerGmailAdapter);
  });
});
