import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import type { Construct } from 'constructs';
import { NAT_INSTANCE, PROJECT_TAG } from './config/constants';

const PUBLIC_SUBNET_NAME = 'public';
const PRIVATE_SUBNET_NAME = 'private-with-egress';
const ISOLATED_SUBNET_NAME = 'isolated';

export class CheckoutDataStack extends cdk.Stack {
  public readonly vpc: ec2.IVpc;
  public readonly lambdaSecurityGroup: ec2.ISecurityGroup;

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
  }
}
