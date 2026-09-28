import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CheckoutDataStack } from '../lib/data-stack';

const FAKE_ENV = { account: '111111111111', region: 'us-east-1' };

function synthDataStack(): Template {
  const app = new App();
  const stack = new CheckoutDataStack(app, 'TestDataStack', { env: FAKE_ENV });

  return Template.fromStack(stack);
}

describe('CheckoutDataStack', () => {
  it('does not create a NAT Gateway', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::EC2::NatGateway', 0);
  });

  it('creates a single t4g.micro NAT instance', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::EC2::Instance', 1);
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.micro',
    });
  });

  it('creates 6 subnets across 2 availability zones', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::EC2::Subnet', 6);
  });

  it('tags the VPC with the project tag', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::EC2::VPC', {
      Tags: Match.arrayWith([{ Key: 'project', Value: 'headphones-checkout' }]),
    });
  });

  it('creates a private, isolated db.t4g.micro Postgres 16 instance with 1-day backups', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::RDS::DBInstance', {
      PubliclyAccessible: false,
      DBInstanceClass: 'db.t4g.micro',
      AllocatedStorage: '20',
      StorageType: 'gp3',
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      BackupRetentionPeriod: 1,
      DeletionProtection: false,
      DBSubnetGroupName: Match.anyValue(),
    });
  });

  it('forces SSL through the parameter group', () => {
    const template = synthDataStack();

    template.hasResourceProperties('AWS::RDS::DBParameterGroup', {
      Parameters: Match.objectLike({ 'rds.force_ssl': '1' }),
    });
  });

  it('deletes the database without a final snapshot', () => {
    const template = synthDataStack();

    template.hasResource('AWS::RDS::DBInstance', {
      DeletionPolicy: 'Delete',
    });
  });

  it('allows exactly one ingress on 5432, sourced from the Lambda security group', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::EC2::SecurityGroupIngress', 1);
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      IpProtocol: 'tcp',
      FromPort: 5432,
      ToPort: 5432,
      SourceSecurityGroupId: Match.objectLike({
        'Fn::GetAtt': Match.arrayWith([Match.stringLikeRegexp('LambdaSecurityGroup')]),
      }),
    });
  });

  it('deletes the db-credentials secret without a recovery window', () => {
    const template = synthDataStack();

    template.hasResource('AWS::SecretsManager::Secret', {
      Properties: Match.objectLike({ Name: 'db-credentials' }),
      DeletionPolicy: 'Delete',
    });
  });

  it('creates app-secrets with the 5 expected placeholder keys, deleted without a recovery window', () => {
    const template = synthDataStack();

    template.hasResource('AWS::SecretsManager::Secret', {
      Properties: {
        Name: 'app-secrets',
        SecretString: Match.serializedJson(
          Match.objectLike({
            PAYMENT_GATEWAY_PRIVATE_KEY: Match.anyValue(),
            PAYMENT_GATEWAY_INTEGRITY_SECRET: Match.anyValue(),
            PAYMENT_GATEWAY_EVENTS_SECRET: Match.anyValue(),
            SMTP_USER: Match.anyValue(),
            SMTP_PASSWORD: Match.anyValue(),
          }),
        ),
      },
      DeletionPolicy: 'Delete',
    });
  });
});
