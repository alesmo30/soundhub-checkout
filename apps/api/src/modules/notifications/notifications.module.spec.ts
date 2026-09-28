import type { AppConfig } from '../../config/app-config';
import { LoggingEmailSender } from './infrastructure/logging-email-sender';
import { NodemailerGmailAdapter } from './infrastructure/nodemailer-gmail.adapter';
import type { NotificationsRepositories, NotificationsRuntime } from './notifications.module';
import {
  buildNotificationsRepositories,
  buildNotificationsRuntime,
  buildSendTransactionEmailDependencies,
  selectEmailSender,
} from './notifications.module';

function buildAppConfig(emailDriver: 'log' | 'smtp', publicUrl: string | null = null): AppConfig {
  return {
    smtp: {
      host: 'smtp.gmail.com',
      port: 465,
      user: 'no-reply@example.com',
      password: 'pass',
      from: 'SoundHub <no-reply@example.com>',
    },
    email: { driver: emailDriver },
    web: { publicUrl },
  } as AppConfig;
}

// NotificationsModule wires SendTransactionEmailUseCase across real,
// TypeORM-backed sibling modules, so it needs a live DataSource to compile
// end to end — that is exercised by the int-spec (step 6), not here. This
// spec covers each of the module's provider factories as the plain
// functions they are, without spinning up Nest's DI container.
describe('selectEmailSender', () => {
  it('resolves LoggingEmailSender for the log driver', () => {
    expect(selectEmailSender(buildAppConfig('log'))).toBeInstanceOf(LoggingEmailSender);
  });

  it('resolves NodemailerGmailAdapter for the smtp driver', () => {
    expect(selectEmailSender(buildAppConfig('smtp'))).toBeInstanceOf(NodemailerGmailAdapter);
  });
});

describe('buildNotificationsRepositories', () => {
  it('bundles the three repositories into one object', () => {
    const transactionRepository = {} as never;
    const customerRepository = {} as never;
    const productRepository = {} as never;

    const result = buildNotificationsRepositories(
      transactionRepository,
      customerRepository,
      productRepository,
    );

    expect(result).toEqual({ transactionRepository, customerRepository, productRepository });
  });
});

describe('buildNotificationsRuntime', () => {
  it('bundles the delivery repository, email sender and unit of work into one object', () => {
    const deliveryRepository = {} as never;
    const emailSender = {} as never;
    const unitOfWork = {} as never;

    const result = buildNotificationsRuntime(deliveryRepository, emailSender, unitOfWork);

    expect(result).toEqual({ deliveryRepository, emailSender, unitOfWork });
  });
});

describe('buildSendTransactionEmailDependencies', () => {
  it('spreads the repositories and runtime, adding publicWebUrl from AppConfig', () => {
    const repositories = {
      transactionRepository: {},
      customerRepository: {},
      productRepository: {},
    } as unknown as NotificationsRepositories;
    const runtime = {
      deliveryRepository: {},
      emailSender: {},
      unitOfWork: {},
    } as unknown as NotificationsRuntime;

    const result = buildSendTransactionEmailDependencies(
      repositories,
      runtime,
      buildAppConfig('log', 'http://localhost:5173'),
    );

    expect(result).toEqual({ ...repositories, ...runtime, publicWebUrl: 'http://localhost:5173' });
  });
});
