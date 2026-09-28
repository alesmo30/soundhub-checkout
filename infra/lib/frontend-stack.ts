import * as cdk from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import { PROJECT_TAG } from './config/constants';

export class CheckoutFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add(PROJECT_TAG.key, PROJECT_TAG.value);
  }
}
