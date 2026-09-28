import { Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import { EMAIL_SENDER } from './application/ports/email-sender.port';
import { LoggingEmailSender } from './infrastructure/logging-email-sender';
import { NodemailerGmailAdapter } from './infrastructure/nodemailer-gmail.adapter';

@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      useFactory: (appConfig: AppConfig) =>
        appConfig.email.driver === 'smtp'
          ? new NodemailerGmailAdapter(appConfig)
          : new LoggingEmailSender(),
      inject: [APP_CONFIG],
    },
  ],
  exports: [EMAIL_SENDER],
})
export class NotificationsModule {}
