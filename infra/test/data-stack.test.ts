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

  it('creates a single t4g.nano NAT instance', () => {
    const template = synthDataStack();

    template.resourceCountIs('AWS::EC2::Instance', 1);
    template.hasResourceProperties('AWS::EC2::Instance', {
      InstanceType: 't4g.nano',
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
});
