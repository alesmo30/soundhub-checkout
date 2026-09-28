import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import {
  APP_SECRET_KEYS,
  DB_BACKUP_DAYS,
  DB_INSTANCE,
  DB_NAME,
  DB_STORAGE_GB,
  NAT_INSTANCE,
  PROJECT_TAG,
} from './config/constants';

const PUBLIC_SUBNET_NAME = 'public';
const PRIVATE_SUBNET_NAME = 'private-with-egress';
const ISOLATED_SUBNET_NAME = 'isolated';
const DB_USERNAME = 'checkout_admin';
const DB_CREDENTIALS_SECRET_NAME = 'db-credentials';
const APP_SECRETS_SECRET_NAME = 'app-secrets';
const PLACEHOLDER_SECRET_VALUE = 'placeholder';

export class CheckoutDataStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly lambdaSecurityGroup: ec2.ISecurityGroup;
  public readonly dbSecret: secretsmanager.ISecret;
  public readonly appSecrets: secretsmanager.ISecret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add(PROJECT_TAG.key, PROJECT_TAG.value);

    // NAT instance instead of NAT Gateway: cost decision, see spec Decisions §Networking.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGatewayProvider: ec2.NatProvider.instanceV2({
        instanceType: new ec2.InstanceType(NAT_INSTANCE),
      }),
      natGateways: 1,
      subnetConfiguration: [
        { name: PUBLIC_SUBNET_NAME, subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: PRIVATE_SUBNET_NAME, subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: ISOLATED_SUBNET_NAME, subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'LambdaSecurityGroup', {
      vpc: this.vpc,
      description: 'Attached to the API and migrator Lambdas',
      allowAllOutbound: true,
    });

    const parameterGroup = new rds.ParameterGroup(this, 'DbParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      parameters: {
        'rds.force_ssl': '1',
      },
    });

    const dbInstance = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: new ec2.InstanceType(DB_INSTANCE.replace(/^db\./, '')),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      credentials: rds.Credentials.fromGeneratedSecret(DB_USERNAME, {
        secretName: DB_CREDENTIALS_SECRET_NAME,
      }),
      databaseName: DB_NAME,
      allocatedStorage: DB_STORAGE_GB,
      storageType: rds.StorageType.GP3,
      multiAz: false,
      publiclyAccessible: false,
      parameterGroup,
      backupRetention: cdk.Duration.days(DB_BACKUP_DAYS),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    dbInstance.connections.allowFrom(this.lambdaSecurityGroup, ec2.Port.tcp(5432));

    this.dbSecret = dbInstance.secret as secretsmanager.ISecret;

    this.appSecrets = new secretsmanager.Secret(this, 'AppSecrets', {
      secretName: APP_SECRETS_SECRET_NAME,
      secretObjectValue: Object.fromEntries(
        APP_SECRET_KEYS.map((key) => [
          key,
          cdk.SecretValue.unsafePlainText(PLACEHOLDER_SECRET_VALUE),
        ]),
      ),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
