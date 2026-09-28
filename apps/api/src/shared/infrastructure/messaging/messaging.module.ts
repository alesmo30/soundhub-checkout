import { SQSClient } from '@aws-sdk/client-sqs';
import { Module } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { EVENT_PUBLISHER } from '../../application/ports/event-publisher.port';
import { InMemoryEventPublisher } from './in-memory-event-publisher';
import { SqsEventPublisher } from './sqs-event-publisher';

@Module({
  providers: [
    {
      provide: EVENT_PUBLISHER,
      useFactory: (appConfig: AppConfig) => {
        if (appConfig.messaging.driver === 'sqs') {
          // Validated at boot: sqs requires messaging.queueUrl (see
          // environment-variables.ts's ValidateIf on TRANSACTION_FINALIZED_QUEUE_URL).
          return new SqsEventPublisher(new SQSClient({}), appConfig.messaging.queueUrl as string);
        }

        return new InMemoryEventPublisher();
      },
      inject: [APP_CONFIG],
    },
  ],
  exports: [EVENT_PUBLISHER],
})
export class MessagingModule {}
