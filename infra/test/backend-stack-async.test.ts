import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CheckoutBackendStack } from '../lib/backend-stack';
import { CheckoutDataStack } from '../lib/data-stack';
import { ASYNC } from '../lib/config/constants';
import type { DeployEnv } from '../lib/config/deploy-env';

const FAKE_ENV = { account: '111111111111', region: 'us-east-1' };
const FAKE_DEPLOY_ENV: DeployEnv = {
  paymentGatewayUrl: 'https://gateway.example.test',
  paymentGatewayPublicKey: 'pub_test_key',
  smtpHost: 'smtp.example.test',
  smtpPort: 465,
  emailFrom: 'SoundHub <no-reply@example.test>',
};
const LAMBDA_BUNDLE_PATH = join(__dirname, 'fixtures/lambda-bundle');

function synthBackendStack(): Template {
  const app = new App();
  const dataStack = new CheckoutDataStack(app, 'TestDataStack', { env: FAKE_ENV });
  const stack = new CheckoutBackendStack(app, 'TestBackendStack', {
    env: FAKE_ENV,
    vpc: dataStack.vpc,
    lambdaSecurityGroup: dataStack.lambdaSecurityGroup,
    dbSecret: dataStack.dbSecret,
    appSecrets: dataStack.appSecrets,
    deployEnv: FAKE_DEPLOY_ENV,
    lambdaBundlePath: LAMBDA_BUNDLE_PATH,
  });

  return Template.fromStack(stack);
}

describe('CheckoutBackendStack — async queue', () => {
  it('creates the transaction-finalized queue with a DLQ redrive policy', () => {
    const template = synthBackendStack();

    const dlqs = template.findResources('AWS::SQS::Queue', {
      Properties: { QueueName: Match.absent() },
    });
    expect(Object.keys(dlqs)).toHaveLength(1);
    const dlqLogicalId = Object.keys(dlqs)[0] as string;

    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: ASYNC.QUEUE_NAME,
      RedrivePolicy: {
        deadLetterTargetArn: { 'Fn::GetAtt': [dlqLogicalId, 'Arn'] },
        maxReceiveCount: ASYNC.DLQ_MAX_RECEIVE_COUNT,
      },
    });
  });

  it('sets the queue visibility timeout to 720 seconds', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::SQS::Queue', {
      QueueName: ASYNC.QUEUE_NAME,
      VisibilityTimeout: 720,
    });
  });

  it("grants the API Lambda sqs:SendMessage scoped to the queue's ARN only", () => {
    const template = synthBackendStack();

    interface PolicyResource {
      Properties: {
        PolicyDocument: { Statement: Array<{ Action: string | string[]; Resource: unknown }> };
        Roles: Array<{ Ref: string }>;
      };
    }

    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const apiLambdaPolicies = Object.values(policies).filter((policy) =>
      policy.Properties.Roles.some((role) => role.Ref.startsWith('ApiLambdaServiceRole')),
    );
    const sendMessageStatements = apiLambdaPolicies
      .flatMap((policy) => policy.Properties.PolicyDocument.Statement)
      .filter((statement) => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('sqs:SendMessage');
      });

    expect(sendMessageStatements).toHaveLength(1);
    const statement = sendMessageStatements[0] as { Resource: unknown };
    expect(statement.Resource).not.toBe('*');

    const resource = statement.Resource as { 'Fn::GetAtt'?: [string, string] };
    expect(resource['Fn::GetAtt']).toBeDefined();
    expect(resource['Fn::GetAtt']?.[1]).toBe('Arn');
  });

  it("adds TRANSACTION_FINALIZED_QUEUE_URL to the API Lambda's environment", () => {
    const template = synthBackendStack();

    const apiLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'lambda.handler' },
    });
    const apiLambda = Object.values(apiLambdas)[0] as {
      Properties: { Environment: { Variables: Record<string, unknown> } };
    };

    expect(apiLambda.Properties.Environment.Variables).toHaveProperty(
      'TRANSACTION_FINALIZED_QUEUE_URL',
    );
  });
});

const EMAIL_WORKER_SECRET_ENV_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'PAYMENT_GATEWAY_PRIVATE_KEY',
  'PAYMENT_GATEWAY_INTEGRITY_SECRET',
  'PAYMENT_GATEWAY_EVENTS_SECRET',
  'SMTP_USER',
  'SMTP_PASSWORD',
];

describe('CheckoutBackendStack — email worker Lambda', () => {
  it('creates the email worker Lambda as arm64/nodejs22.x/512MB/2min in the VPC', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'email-worker.handler',
      Architectures: ['arm64'],
      Runtime: 'nodejs22.x',
      MemorySize: ASYNC.EMAIL_WORKER.MEMORY_MB,
      Timeout: 120,
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
    });
  });

  it('keeps the email worker Lambda logs for 14 days in its own LogGroup', () => {
    const template = synthBackendStack();

    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 4);
  });

  it('consumes the transaction-finalized queue with batch size 5 and partial batch responses', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
      BatchSize: ASYNC.SQS_BATCH_SIZE,
      FunctionResponseTypes: ['ReportBatchItemFailures'],
    });
  });

  it('never puts a secret value in the email worker Lambda environment', () => {
    const template = synthBackendStack();

    const emailWorkerLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'email-worker.handler' },
    });
    const emailWorkerLambda = Object.values(emailWorkerLambdas)[0] as {
      Properties: { Environment: { Variables: Record<string, unknown> } };
    };
    const envKeys = Object.keys(emailWorkerLambda.Properties.Environment.Variables);

    expect(envKeys).toEqual(expect.arrayContaining(['DB_SECRET_ARN', 'APP_SECRETS_ARN']));
    for (const secretKey of EMAIL_WORKER_SECRET_ENV_KEYS) {
      expect(envKeys).not.toContain(secretKey);
    }
  });

  it("grants the email worker Lambda read access to both secrets, scoped (no '*')", () => {
    const template = synthBackendStack();

    interface PolicyResource {
      Properties: {
        PolicyDocument: { Statement: Array<{ Action: string | string[]; Resource: unknown }> };
        Roles: Array<{ Ref: string }>;
      };
    }

    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const emailWorkerPolicies = Object.values(policies).filter((policy) =>
      policy.Properties.Roles.some((role) => role.Ref.startsWith('EmailWorkerLambdaServiceRole')),
    );

    expect(emailWorkerPolicies.length).toBeGreaterThan(0);

    const resourceArns: unknown[] = [];
    for (const policy of emailWorkerPolicies) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        if (!actions.includes('secretsmanager:GetSecretValue')) {
          continue;
        }
        expect(statement.Resource).not.toBe('*');
        const resourceList: unknown[] = Array.isArray(statement.Resource)
          ? (statement.Resource as unknown[])
          : [statement.Resource];
        resourceArns.push(...resourceList);
      }
    }

    expect(resourceArns).toHaveLength(2);
  });
});

describe('CheckoutBackendStack — reconciler Lambda and schedule', () => {
  it('creates the reconciler Lambda as arm64/nodejs22.x/512MB/1min in the VPC', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'reconciler.handler',
      Architectures: ['arm64'],
      Runtime: 'nodejs22.x',
      MemorySize: ASYNC.RECONCILER.MEMORY_MB,
      Timeout: 60,
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
    });
  });

  it('gives the reconciler Lambda its own LogGroup with 14-day retention', () => {
    const template = synthBackendStack();

    const reconcilerLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'reconciler.handler' },
    });
    const reconcilerLambda = Object.values(reconcilerLambdas)[0] as {
      Properties: { LoggingConfig?: { LogGroup?: { Ref: string } } };
    };
    const logGroupRef = reconcilerLambda.Properties.LoggingConfig?.LogGroup?.Ref;
    expect(logGroupRef).toBeDefined();

    const logGroups = template.findResources('AWS::Logs::LogGroup', {
      Properties: { RetentionInDays: 14 },
    });
    expect(Object.keys(logGroups)).toContain(logGroupRef);
  });

  it("grants the reconciler Lambda read access to both secrets, scoped (no '*')", () => {
    const template = synthBackendStack();

    interface PolicyResource {
      Properties: {
        PolicyDocument: { Statement: Array<{ Action: string | string[]; Resource: unknown }> };
        Roles: Array<{ Ref: string }>;
      };
    }

    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const reconcilerPolicies = Object.values(policies).filter((policy) =>
      policy.Properties.Roles.some((role) => role.Ref.startsWith('ReconcilerLambdaServiceRole')),
    );

    expect(reconcilerPolicies.length).toBeGreaterThan(0);

    const resourceArns: unknown[] = [];
    for (const policy of reconcilerPolicies) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        if (!actions.includes('secretsmanager:GetSecretValue')) {
          continue;
        }
        expect(statement.Resource).not.toBe('*');
        const resourceList: unknown[] = Array.isArray(statement.Resource)
          ? (statement.Resource as unknown[])
          : [statement.Resource];
        resourceArns.push(...resourceList);
      }
    }

    expect(resourceArns).toHaveLength(2);
  });

  it('creates an EventBridge Scheduler rate(1 minute) schedule targeting the reconciler Lambda', () => {
    const template = synthBackendStack();

    const reconcilerLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'reconciler.handler' },
    });
    const reconcilerLogicalId = Object.keys(reconcilerLambdas)[0] as string;

    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      ScheduleExpression: ASYNC.RECONCILER.SCHEDULE_RATE,
      FlexibleTimeWindow: { Mode: 'OFF' },
      Target: Match.objectLike({
        Arn: { 'Fn::GetAtt': [reconcilerLogicalId, 'Arn'] },
        RetryPolicy: {
          MaximumRetryAttempts: ASYNC.RECONCILER.MAX_RETRY_ATTEMPTS,
          MaximumEventAgeInSeconds: ASYNC.RECONCILER.MAX_EVENT_AGE_SECONDS,
        },
      }),
    });
  });

  it("scopes the schedule's invoke permission to a dedicated scheduler role, not public", () => {
    const template = synthBackendStack();

    const schedules = template.findResources('AWS::Scheduler::Schedule');
    const schedule = Object.values(schedules)[0] as {
      Properties: { Target: { RoleArn: unknown } };
    };
    expect(schedule.Properties.Target.RoleArn).not.toBe('*');

    const roles = template.findResources('AWS::IAM::Role', {
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [
            Match.objectLike({
              Principal: { Service: 'scheduler.amazonaws.com' },
            }),
          ],
        },
      },
    });
    expect(Object.keys(roles)).toHaveLength(1);
    const scheduleRoleLogicalId = Object.keys(roles)[0] as string;

    interface PolicyResource {
      Properties: {
        PolicyDocument: { Statement: Array<{ Action: string | string[]; Resource: unknown }> };
        Roles: Array<{ Ref: string }>;
      };
    }
    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const invokePolicies = Object.values(policies).filter((policy) =>
      policy.Properties.Roles.some((role) => role.Ref === scheduleRoleLogicalId),
    );
    expect(invokePolicies.length).toBeGreaterThan(0);

    const invokeStatements = invokePolicies.flatMap((policy) =>
      policy.Properties.PolicyDocument.Statement.filter((statement) => {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        return actions.includes('lambda:InvokeFunction');
      }),
    );
    expect(invokeStatements.length).toBeGreaterThan(0);
    for (const statement of invokeStatements) {
      const resourceList = Array.isArray(statement.Resource)
        ? statement.Resource
        : [statement.Resource];
      for (const resource of resourceList) {
        expect(resource).not.toBe('*');
      }
    }
  });
});

describe('CheckoutBackendStack — alarms and SNS notification', () => {
  it('declares an AlarmEmail string parameter with no default', () => {
    const template = synthBackendStack();

    template.hasParameter('AlarmEmail', {
      Type: 'String',
      Default: Match.absent(),
    });
  });

  it('creates exactly one SNS topic with a single email subscription bound to the AlarmEmail parameter', () => {
    const template = synthBackendStack();

    const topics = template.findResources('AWS::SNS::Topic');
    expect(Object.keys(topics)).toHaveLength(1);
    const topicLogicalId = Object.keys(topics)[0] as string;

    const subscriptions = template.findResources('AWS::SNS::Subscription', {
      Properties: { TopicArn: { Ref: topicLogicalId } },
    });
    expect(Object.keys(subscriptions)).toHaveLength(1);

    const subscription = Object.values(subscriptions)[0] as {
      Properties: { Protocol: string; Endpoint: unknown };
    };
    expect(subscription.Properties.Protocol).toBe('email');
    expect(subscription.Properties.Endpoint).toEqual({ Ref: 'AlarmEmail' });
  });

  it('alarms on the DLQ having visible messages, notifying the SNS topic', () => {
    const template = synthBackendStack();

    const dlqs = template.findResources('AWS::SQS::Queue', {
      Properties: { QueueName: Match.absent() },
    });
    const dlqLogicalId = Object.keys(dlqs)[0] as string;

    const topics = template.findResources('AWS::SNS::Topic');
    const topicLogicalId = Object.keys(topics)[0] as string;

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/SQS',
      MetricName: 'ApproximateNumberOfMessagesVisible',
      Dimensions: [{ Name: 'QueueName', Value: { 'Fn::GetAtt': [dlqLogicalId, 'QueueName'] } }],
      Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [{ Ref: topicLogicalId }],
    });
  });

  it('alarms on email worker Lambda errors, notifying the SNS topic', () => {
    const template = synthBackendStack();

    const emailWorkerLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'email-worker.handler' },
    });
    const emailWorkerLogicalId = Object.keys(emailWorkerLambdas)[0] as string;

    const topics = template.findResources('AWS::SNS::Topic');
    const topicLogicalId = Object.keys(topics)[0] as string;

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Dimensions: [{ Name: 'FunctionName', Value: { Ref: emailWorkerLogicalId } }],
      Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [{ Ref: topicLogicalId }],
    });
  });

  it('alarms on reconciler Lambda errors, notifying the SNS topic', () => {
    const template = synthBackendStack();

    const reconcilerLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'reconciler.handler' },
    });
    const reconcilerLogicalId = Object.keys(reconcilerLambdas)[0] as string;

    const topics = template.findResources('AWS::SNS::Topic');
    const topicLogicalId = Object.keys(topics)[0] as string;

    template.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/Lambda',
      MetricName: 'Errors',
      Dimensions: [{ Name: 'FunctionName', Value: { Ref: reconcilerLogicalId } }],
      Threshold: 0,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [{ Ref: topicLogicalId }],
    });
  });
});
