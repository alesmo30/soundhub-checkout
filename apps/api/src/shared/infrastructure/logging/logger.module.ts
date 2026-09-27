import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule as NestjsPinoModule } from 'nestjs-pino';

import type { AppConfig } from '../../../config/app-config';
import { APP_CONFIG } from '../../../config/config.module';
import { resolveRequestId } from '../http/request-id.middleware';
import { REDACT_CENSOR, REDACT_PATHS } from './redact-paths';

@Module({
  imports: [
    NestjsPinoModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (appConfig: AppConfig) => ({
        pinoHttp: {
          level: appConfig.app.logLevel,
          genReqId: (request: IncomingMessage) => {
            const header = request.headers['x-request-id'];
            return resolveRequestId(typeof header === 'string' ? header : undefined);
          },
          redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
          transport:
            appConfig.app.nodeEnv === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
  ],
  exports: [NestjsPinoModule],
})
export class LoggerModule {}
