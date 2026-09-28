import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as triggers from 'aws-cdk-lib/triggers';
import type { Construct } from 'constructs';
import type { DeployEnv } from './config/deploy-env';
import {
  API_LAMBDA,
  ASYNC,
  DB_NAME,
  HTTP_API_THROTTLE,
  MIGRATOR_LAMBDA,
  PROJECT_TAG,
} from './config/constants';

// logs.RetentionDays.TWO_WEEKS matches the LOG_RETENTION_DAYS (14) constant;
// the CDK enum has no arbitrary-day variant to reference it directly.

const NODE_ENV_PRODUCTION = 'production';
const LOG_LEVEL_INFO = 'info';
const API_PORT = '3000';
const DB_SSL_ENABLED = 'true';
const API_HANDLER = 'lambda.handler';
const MIGRATOR_HANDLER = 'migrator.handler';
const EMAIL_WORKER_HANDLER = 'email-worker.handler';
const EMAIL_DRIVER_SMTP = 'smtp';
const EVENT_PUBLISHER_DRIVER_SQS = 'sqs';
const RECONCILER_HANDLER = 'reconciler.handler';
const SCHEDULER_ASSUME_ROLE_SERVICE = 'scheduler.amazonaws.com';
const SCHEDULER_FLEXIBLE_TIME_WINDOW_MODE = 'OFF';
const ALARM_EMAIL_PARAM_DESCRIPTION =
  'Email address that receives DLQ and Lambda error alarm notifications.';
const DLQ_VISIBLE_MESSAGES_METRIC = 'ApproximateNumberOfMessagesVisible';
const LAMBDA_ERRORS_METRIC = 'Errors';
const LAMBDA_NAMESPACE = 'AWS/Lambda';
const ALARM_THRESHOLD = 0;
const ALARM_EVALUATION_PERIODS = 1;
const ALARM_PERIOD = cdk.Duration.minutes(1);

export interface DataStackOutputs {
  vpc: ec2.IVpc;
  lambdaSecurityGroup: ec2.ISecurityGroup;
  dbSecret: secretsmanager.ISecret;
  appSecrets: secretsmanager.ISecret;
}

export interface BackendStackProps extends cdk.StackProps, DataStackOutputs {
  deployEnv: DeployEnv;
  lambdaBundlePath: string;
}

export class CheckoutBackendStack extends cdk.Stack {
  public readonly httpApi: apigatewayv2.IHttpApi;

  constructor(scope: Construct, id: string, props: BackendStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add(PROJECT_TAG.key, PROJECT_TAG.value);

    const alarmEmailParam = new cdk.CfnParameter(this, 'AlarmEmail', {
      type: 'String',
      description: ALARM_EMAIL_PARAM_DESCRIPTION,
    });

    const { vpc, lambdaSecurityGroup, dbSecret, appSecrets, deployEnv, lambdaBundlePath } = props;
    const code = lambda.Code.fromAsset(lambdaBundlePath);
    const vpcSubnets: ec2.SubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: API_LAMBDA.memoryMb,
      timeout: cdk.Duration.seconds(API_LAMBDA.timeoutSeconds),
      reservedConcurrentExecutions: API_LAMBDA.reservedConcurrency,
      handler: API_HANDLER,
      code,
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSecurityGroup],
      logGroup: new logs.LogGroup(this, 'ApiLambdaLogGroup', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        NODE_ENV: NODE_ENV_PRODUCTION,
        PORT: API_PORT,
        LOG_LEVEL: LOG_LEVEL_INFO,
        DB_NAME,
        DB_SSL: DB_SSL_ENABLED,
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRETS_ARN: appSecrets.secretArn,
        PAYMENT_GATEWAY_URL: deployEnv.paymentGatewayUrl,
        PAYMENT_GATEWAY_PUBLIC_KEY: deployEnv.paymentGatewayPublicKey,
        SMTP_HOST: deployEnv.smtpHost,
        SMTP_PORT: String(deployEnv.smtpPort),
        EMAIL_FROM: deployEnv.emailFrom,
        EVENT_PUBLISHER_DRIVER: EVENT_PUBLISHER_DRIVER_SQS,
      },
    });

    const migratorLambda = new lambda.Function(this, 'MigratorLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: MIGRATOR_LAMBDA.memoryMb,
      timeout: cdk.Duration.seconds(MIGRATOR_LAMBDA.timeoutSeconds),
      handler: MIGRATOR_HANDLER,
      code,
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSecurityGroup],
      logGroup: new logs.LogGroup(this, 'MigratorLambdaLogGroup', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        NODE_ENV: NODE_ENV_PRODUCTION,
        LOG_LEVEL: LOG_LEVEL_INFO,
        DB_NAME,
        DB_SSL: DB_SSL_ENABLED,
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRETS_ARN: appSecrets.secretArn,
      },
    });

    dbSecret.grantRead(apiLambda);
    appSecrets.grantRead(apiLambda);
    dbSecret.grantRead(migratorLambda);
    appSecrets.grantRead(migratorLambda);

    const transactionFinalizedDlq = new sqs.Queue(this, 'TransactionFinalizedDlq');

    const transactionFinalizedQueue = new sqs.Queue(this, 'TransactionFinalizedQueue', {
      queueName: ASYNC.QUEUE_NAME,
      visibilityTimeout: ASYNC.QUEUE_VISIBILITY_TIMEOUT,
      deadLetterQueue: {
        queue: transactionFinalizedDlq,
        maxReceiveCount: ASYNC.DLQ_MAX_RECEIVE_COUNT,
      },
    });
    transactionFinalizedQueue.grantSendMessages(apiLambda);
    apiLambda.addEnvironment('TRANSACTION_FINALIZED_QUEUE_URL', transactionFinalizedQueue.queueUrl);

    const emailWorkerLambda = new lambda.Function(this, 'EmailWorkerLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: ASYNC.EMAIL_WORKER.MEMORY_MB,
      timeout: ASYNC.EMAIL_WORKER.TIMEOUT,
      handler: EMAIL_WORKER_HANDLER,
      code,
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSecurityGroup],
      logGroup: new logs.LogGroup(this, 'EmailWorkerLambdaLogGroup', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        NODE_ENV: NODE_ENV_PRODUCTION,
        PORT: API_PORT,
        LOG_LEVEL: LOG_LEVEL_INFO,
        EMAIL_DRIVER: EMAIL_DRIVER_SMTP,
        DB_NAME,
        DB_SSL: DB_SSL_ENABLED,
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRETS_ARN: appSecrets.secretArn,
        PAYMENT_GATEWAY_URL: deployEnv.paymentGatewayUrl,
        PAYMENT_GATEWAY_PUBLIC_KEY: deployEnv.paymentGatewayPublicKey,
        SMTP_HOST: deployEnv.smtpHost,
        SMTP_PORT: String(deployEnv.smtpPort),
        EMAIL_FROM: deployEnv.emailFrom,
      },
    });
    dbSecret.grantRead(emailWorkerLambda);
    appSecrets.grantRead(emailWorkerLambda);
    emailWorkerLambda.addEventSource(
      new SqsEventSource(transactionFinalizedQueue, {
        batchSize: ASYNC.SQS_BATCH_SIZE,
        reportBatchItemFailures: true,
      }),
    );

    const reconcilerLambda = new lambda.Function(this, 'ReconcilerLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: ASYNC.RECONCILER.MEMORY_MB,
      timeout: ASYNC.RECONCILER.TIMEOUT,
      handler: RECONCILER_HANDLER,
      code,
      vpc,
      vpcSubnets,
      securityGroups: [lambdaSecurityGroup],
      logGroup: new logs.LogGroup(this, 'ReconcilerLambdaLogGroup', {
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
      environment: {
        NODE_ENV: NODE_ENV_PRODUCTION,
        PORT: API_PORT,
        LOG_LEVEL: LOG_LEVEL_INFO,
        DB_NAME,
        DB_SSL: DB_SSL_ENABLED,
        DB_SECRET_ARN: dbSecret.secretArn,
        APP_SECRETS_ARN: appSecrets.secretArn,
        PAYMENT_GATEWAY_URL: deployEnv.paymentGatewayUrl,
        PAYMENT_GATEWAY_PUBLIC_KEY: deployEnv.paymentGatewayPublicKey,
        SMTP_HOST: deployEnv.smtpHost,
        SMTP_PORT: String(deployEnv.smtpPort),
        EMAIL_FROM: deployEnv.emailFrom,
        TRANSACTION_FINALIZED_QUEUE_URL: transactionFinalizedQueue.queueUrl,
      },
    });
    dbSecret.grantRead(reconcilerLambda);
    appSecrets.grantRead(reconcilerLambda);
    transactionFinalizedQueue.grantSendMessages(reconcilerLambda);

    // The scheduler invokes the reconciler through this dedicated role rather
    // than a Lambda resource policy, so the permission stays scoped to
    // scheduler.amazonaws.com instead of being publicly invokable.
    const reconcilerScheduleRole = new iam.Role(this, 'ReconcilerScheduleRole', {
      assumedBy: new iam.ServicePrincipal(SCHEDULER_ASSUME_ROLE_SERVICE),
    });
    reconcilerLambda.grantInvoke(reconcilerScheduleRole);

    new scheduler.CfnSchedule(this, 'ReconcilerSchedule', {
      scheduleExpression: ASYNC.RECONCILER.SCHEDULE_RATE,
      flexibleTimeWindow: { mode: SCHEDULER_FLEXIBLE_TIME_WINDOW_MODE },
      target: {
        arn: reconcilerLambda.functionArn,
        roleArn: reconcilerScheduleRole.roleArn,
        retryPolicy: {
          maximumRetryAttempts: ASYNC.RECONCILER.MAX_RETRY_ATTEMPTS,
          maximumEventAgeInSeconds: ASYNC.RECONCILER.MAX_EVENT_AGE_SECONDS,
        },
      },
    });

    const asyncAlarmsTopic = new sns.Topic(this, 'AsyncAlarmsTopic');
    asyncAlarmsTopic.addSubscription(
      new subscriptions.EmailSubscription(alarmEmailParam.valueAsString),
    );
    const alarmAction = new SnsAction(asyncAlarmsTopic);

    const dlqNotEmptyAlarm = new cloudwatch.Alarm(this, 'DlqNotEmptyAlarm', {
      metric: transactionFinalizedDlq.metric(DLQ_VISIBLE_MESSAGES_METRIC, {
        period: ALARM_PERIOD,
      }),
      threshold: ALARM_THRESHOLD,
      evaluationPeriods: ALARM_EVALUATION_PERIODS,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    dlqNotEmptyAlarm.addAlarmAction(alarmAction);

    const emailWorkerErrorsAlarm = new cloudwatch.Alarm(this, 'EmailWorkerErrorsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: LAMBDA_NAMESPACE,
        metricName: LAMBDA_ERRORS_METRIC,
        dimensionsMap: { FunctionName: emailWorkerLambda.functionName },
        statistic: 'Sum',
        period: ALARM_PERIOD,
      }),
      threshold: ALARM_THRESHOLD,
      evaluationPeriods: ALARM_EVALUATION_PERIODS,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    emailWorkerErrorsAlarm.addAlarmAction(alarmAction);

    const reconcilerErrorsAlarm = new cloudwatch.Alarm(this, 'ReconcilerErrorsAlarm', {
      metric: new cloudwatch.Metric({
        namespace: LAMBDA_NAMESPACE,
        metricName: LAMBDA_ERRORS_METRIC,
        dimensionsMap: { FunctionName: reconcilerLambda.functionName },
        statistic: 'Sum',
        period: ALARM_PERIOD,
      }),
      threshold: ALARM_THRESHOLD,
      evaluationPeriods: ALARM_EVALUATION_PERIODS,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });
    reconcilerErrorsAlarm.addAlarmAction(alarmAction);

    // Runs the migrator during every `cdk deploy` and re-runs it whenever the
    // migrator's code or config changes, so the schema/seed are applied
    // before the API Lambda serves traffic from the new deployment.
    const migratorTrigger = new triggers.Trigger(this, 'MigratorTrigger', {
      handler: migratorLambda,
    });
    migratorTrigger.executeBefore(apiLambda);

    const httpApi = new apigatewayv2.HttpApi(this, 'HttpApi', {
      createDefaultStage: false,
    });
    httpApi.addRoutes({
      path: '/{proxy+}',
      methods: [apigatewayv2.HttpMethod.ANY],
      integration: new HttpLambdaIntegration('ApiIntegration', apiLambda),
    });

    new apigatewayv2.HttpStage(this, 'DefaultStage', {
      httpApi,
      autoDeploy: true,
      throttle: {
        rateLimit: HTTP_API_THROTTLE.rateLimit,
        burstLimit: HTTP_API_THROTTLE.burstLimit,
      },
    });

    this.httpApi = httpApi;
  }
}
