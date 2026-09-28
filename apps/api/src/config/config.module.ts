import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';

import { APP_CONFIG, buildAppConfig, type AppConfig } from './app-config';
import { EnvironmentVariables, validateEnvironmentVariables } from './environment-variables';

export { APP_CONFIG };

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      // Resolved against process.cwd(), which pnpm sets to apps/api for every
      // script; the single .env lives at the repo root and also feeds apps/web.
      envFilePath: '../../.env',
      validate: validateEnvironmentVariables,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (configService: ConfigService<EnvironmentVariables, true>): AppConfig =>
        buildAppConfig({
          NODE_ENV: configService.get('NODE_ENV', { infer: true }),
          PORT: configService.get('PORT', { infer: true }),
          LOG_LEVEL: configService.get('LOG_LEVEL', { infer: true }),
          DB_HOST: configService.get('DB_HOST', { infer: true }),
          DB_PORT: configService.get('DB_PORT', { infer: true }),
          DB_USERNAME: configService.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: configService.get('DB_PASSWORD', { infer: true }),
          DB_NAME: configService.get('DB_NAME', { infer: true }),
          DB_SSL: configService.get('DB_SSL', { infer: true }),
          PAYMENT_GATEWAY_URL: configService.get('PAYMENT_GATEWAY_URL', { infer: true }),
          PAYMENT_GATEWAY_PUBLIC_KEY: configService.get('PAYMENT_GATEWAY_PUBLIC_KEY', {
            infer: true,
          }),
          PAYMENT_GATEWAY_PRIVATE_KEY: configService.get('PAYMENT_GATEWAY_PRIVATE_KEY', {
            infer: true,
          }),
          PAYMENT_GATEWAY_INTEGRITY_SECRET: configService.get('PAYMENT_GATEWAY_INTEGRITY_SECRET', {
            infer: true,
          }),
          PAYMENT_GATEWAY_EVENTS_SECRET: configService.get('PAYMENT_GATEWAY_EVENTS_SECRET', {
            infer: true,
          }),
          SMTP_HOST: configService.get('SMTP_HOST', { infer: true }),
          SMTP_PORT: configService.get('SMTP_PORT', { infer: true }),
          SMTP_USER: configService.get('SMTP_USER', { infer: true }),
          SMTP_PASSWORD: configService.get('SMTP_PASSWORD', { infer: true }),
          EMAIL_FROM: configService.get('EMAIL_FROM', { infer: true }),
          EVENT_PUBLISHER_DRIVER: configService.get('EVENT_PUBLISHER_DRIVER', { infer: true }),
          TRANSACTION_FINALIZED_QUEUE_URL: configService.get('TRANSACTION_FINALIZED_QUEUE_URL', {
            infer: true,
          }),
          EMAIL_DRIVER: configService.get('EMAIL_DRIVER', { infer: true }),
          PUBLIC_WEB_URL: configService.get('PUBLIC_WEB_URL', { infer: true }),
        }),
      inject: [ConfigService],
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
