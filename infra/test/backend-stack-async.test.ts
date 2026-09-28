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
      };
    }

    const policies = template.findResources('AWS::IAM::Policy') as Record<string, PolicyResource>;
    const sendMessageStatements = Object.values(policies)
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

    expect(apiLambda.Properties.Environment.Variables).toHaveProperty('TRANSACTION_FINALIZED_QUEUE_URL');
  });
});
