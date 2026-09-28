import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CheckoutBackendStack } from '../lib/backend-stack';
import { CheckoutDataStack } from '../lib/data-stack';
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

const SECRET_ENV_KEYS = [
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

describe('CheckoutBackendStack', () => {
  it('creates the API Lambda as arm64/nodejs22.x/1024MB in the VPC, with reserved concurrency 10', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'lambda.handler',
      Architectures: ['arm64'],
      Runtime: 'nodejs22.x',
      MemorySize: 1024,
      VpcConfig: Match.objectLike({
        SecurityGroupIds: Match.anyValue(),
        SubnetIds: Match.anyValue(),
      }),
      ReservedConcurrentExecutions: 10,
    });
  });

  it('creates the migrator Lambda without reserved concurrency', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::Lambda::Function', {
      Handler: 'migrator.handler',
      Architectures: ['arm64'],
      Runtime: 'nodejs22.x',
      MemorySize: 512,
      ReservedConcurrentExecutions: Match.absent(),
    });
  });

  it('throttles the HTTP API default stage at 50 rps / 100 burst', () => {
    const template = synthBackendStack();

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      StageName: '$default',
      DefaultRouteSettings: {
        ThrottlingRateLimit: 50,
        ThrottlingBurstLimit: 100,
      },
    });
  });

  it('runs the migrator trigger before the API Lambda is created', () => {
    const template = synthBackendStack();

    const triggers = template.findResources('Custom::Trigger');
    const triggerIds = Object.keys(triggers);
    expect(triggerIds).toHaveLength(1);

    const triggerLogicalId = triggerIds[0] as string;
    const trigger = triggers[triggerLogicalId] as { Properties: { HandlerArn: { Ref: string } } };
    const handlerArnRef = trigger.Properties.HandlerArn.Ref;
    expect(handlerArnRef).toMatch(/^MigratorLambdaCurrentVersion/);

    const apiLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'lambda.handler' },
    });
    const apiLambda = Object.values(apiLambdas)[0] as { DependsOn: string[] };
    expect(apiLambda.DependsOn).toEqual(expect.arrayContaining([triggerLogicalId]));
  });

  it('grants GetSecretValue-scoped secretsmanager access to exactly 2 secret ARNs', () => {
    const template = synthBackendStack();

    interface PolicyResource {
      Properties: {
        PolicyDocument: { Statement: Array<{ Action: string | string[]; Resource: unknown }> };
      };
    }

    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const resourceArns = new Set<string>();

    for (const policy of Object.values(policies)) {
      const statements = policy.Properties.PolicyDocument.Statement;
      for (const statement of statements) {
        const actions = Array.isArray(statement.Action) ? statement.Action : [statement.Action];
        if (!actions.includes('secretsmanager:GetSecretValue')) {
          continue;
        }
        expect(statement.Resource).not.toBe('*');
        resourceArns.add(JSON.stringify(statement.Resource));
      }
    }

    expect(resourceArns.size).toBe(2);
  });

  it('keeps API, migrator, email worker and reconciler Lambda logs for 14 days', () => {
    const template = synthBackendStack();

    template.resourcePropertiesCountIs('AWS::Logs::LogGroup', { RetentionInDays: 14 }, 4);
  });

  it('never puts a secret value in the API Lambda environment', () => {
    const template = synthBackendStack();

    const apiLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'lambda.handler' },
    });
    const apiLambda = Object.values(apiLambdas)[0] as {
      Properties: { Environment: { Variables: Record<string, unknown> } };
    };
    const envKeys = Object.keys(apiLambda.Properties.Environment.Variables);

    expect(envKeys).toEqual(expect.arrayContaining(['DB_SECRET_ARN', 'APP_SECRETS_ARN']));
    for (const secretKey of SECRET_ENV_KEYS) {
      expect(envKeys).not.toContain(secretKey);
    }
  });

  it('never puts a secret value in the migrator Lambda environment', () => {
    const template = synthBackendStack();

    const migratorLambdas = template.findResources('AWS::Lambda::Function', {
      Properties: { Handler: 'migrator.handler' },
    });
    const migratorLambda = Object.values(migratorLambdas)[0] as {
      Properties: { Environment: { Variables: Record<string, unknown> } };
    };
    const envKeys = Object.keys(migratorLambda.Properties.Environment.Variables);

    expect(envKeys).toEqual(expect.arrayContaining(['DB_SECRET_ARN', 'APP_SECRETS_ARN']));
    for (const secretKey of SECRET_ENV_KEYS) {
      expect(envKeys).not.toContain(secretKey);
    }
  });
});
