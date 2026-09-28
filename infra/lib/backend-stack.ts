import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as triggers from 'aws-cdk-lib/triggers';
import type { Construct } from 'constructs';
import type { DeployEnv } from './config/deploy-env';
import { API_LAMBDA, DB_NAME, HTTP_API_THROTTLE, MIGRATOR_LAMBDA, PROJECT_TAG } from './config/constants';

// logs.RetentionDays.TWO_WEEKS matches the LOG_RETENTION_DAYS (14) constant;
// the CDK enum has no arbitrary-day variant to reference it directly.

const NODE_ENV_PRODUCTION = 'production';
const LOG_LEVEL_INFO = 'info';
const API_PORT = '3000';
const DB_SSL_ENABLED = 'true';
const API_HANDLER = 'lambda.handler';
const MIGRATOR_HANDLER = 'migrator.handler.handler';

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

    const { vpc, lambdaSecurityGroup, dbSecret, appSecrets, deployEnv, lambdaBundlePath } = props;
    const code = lambda.Code.fromAsset(lambdaBundlePath);
    const vpcSubnets: ec2.SubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    const apiLambda = new lambda.Function(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: API_LAMBDA.memoryMb,
      timeout: cdk.Duration.seconds(API_LAMBDA.timeoutSeconds),
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
