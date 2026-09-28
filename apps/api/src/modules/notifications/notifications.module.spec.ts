import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { APP_CONFIG, type AppConfig } from '../../config/app-config';
import type { EmailSender } from './application/ports/email-sender.port';
import { EMAIL_SENDER } from './application/ports/email-sender.port';
import { LoggingEmailSender } from './infrastructure/logging-email-sender';
import { NodemailerGmailAdapter } from './infrastructure/nodemailer-gmail.adapter';
import { NotificationsModule } from './notifications.module';

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

// Mirrors ConfigModule's @Global() APP_CONFIG binding from the real app
// composition, which NotificationsModule relies on rather than importing itself.
function buildFakeConfigModule(appConfig: AppConfig) {
  @Global()
  @Module({ providers: [{ provide: APP_CONFIG, useValue: appConfig }], exports: [APP_CONFIG] })
  class FakeConfigModule {}

  return FakeConfigModule;
}

describe('NotificationsModule', () => {
  it('resolves LoggingEmailSender for the log driver', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [buildFakeConfigModule(buildAppConfig('log')), NotificationsModule],
    }).compile();

    const emailSender = moduleRef.get<EmailSender>(EMAIL_SENDER);

    expect(emailSender).toBeInstanceOf(LoggingEmailSender);
  });

  it('resolves NodemailerGmailAdapter for the smtp driver', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [buildFakeConfigModule(buildAppConfig('smtp')), NotificationsModule],
    }).compile();

    const emailSender = moduleRef.get<EmailSender>(EMAIL_SENDER);

    expect(emailSender).toBeInstanceOf(NodemailerGmailAdapter);
  });
});
