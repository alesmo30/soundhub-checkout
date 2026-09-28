import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import type { EventPublisher } from '../../application/ports/event-publisher.port';
import { EVENT_PUBLISHER } from '../../application/ports/event-publisher.port';
import { InMemoryEventPublisher } from './in-memory-event-publisher';
import { MessagingModule } from './messaging.module';
import { SqsEventPublisher } from './sqs-event-publisher';

function buildAppConfig(messagingOverrides: Partial<AppConfig['messaging']> = {}): AppConfig {
  return {
    app: { nodeEnv: 'test', port: 3000, logLevel: 'error' },
    db: { host: '', port: 5432, username: '', password: '', name: '', ssl: false },
    paymentGateway: {
      url: '',
      publicKey: '',
      privateKey: '',
      integritySecret: '',
      eventsSecret: '',
    },
    smtp: { host: '', port: 465, user: '', password: '', from: '' },
    messaging: { driver: 'memory', queueUrl: null, ...messagingOverrides },
    email: { driver: 'log' },
    web: { publicUrl: null },
  };
}

// Mirrors ConfigModule's @Global() APP_CONFIG binding from the real app
// composition, which MessagingModule relies on rather than importing itself.
function buildFakeConfigModule(appConfig: AppConfig) {
  @Global()
  @Module({ providers: [{ provide: APP_CONFIG, useValue: appConfig }], exports: [APP_CONFIG] })
  class FakeConfigModule {}

  return FakeConfigModule;
}

describe('MessagingModule', () => {
  it('resolves InMemoryEventPublisher for the memory driver', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [buildFakeConfigModule(buildAppConfig()), MessagingModule],
    }).compile();

    const eventPublisher = moduleRef.get<EventPublisher>(EVENT_PUBLISHER);

    expect(eventPublisher).toBeInstanceOf(InMemoryEventPublisher);
  });

  it('resolves SqsEventPublisher for the sqs driver', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        buildFakeConfigModule(
          buildAppConfig({
            driver: 'sqs',
            queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/queue',
          }),
        ),
        MessagingModule,
      ],
    }).compile();

    const eventPublisher = moduleRef.get<EventPublisher>(EVENT_PUBLISHER);

    expect(eventPublisher).toBeInstanceOf(SqsEventPublisher);
  });
});
