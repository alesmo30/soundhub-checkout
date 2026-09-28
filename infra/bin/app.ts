#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import * as cdk from 'aws-cdk-lib';
import { loadDeployEnv, readDeployAccount } from '../lib/config/deploy-env';
import { REGION, STACK_PREFIX } from '../lib/config/constants';
import { CheckoutDataStack } from '../lib/data-stack';
import { CheckoutBackendStack } from '../lib/backend-stack';
import { CheckoutFrontendStack } from '../lib/frontend-stack';

// Fails synth fast, naming the exact missing variable, before any stack is built.
const rootEnvPath = resolve(__dirname, '../../.env');
const deployEnv = loadDeployEnv(parseEnv(readFileSync(rootEnvPath, 'utf-8')));
const lambdaBundlePath = join(__dirname, '../../apps/api/dist-lambda');
const webDistPath = join(__dirname, '../../apps/web/dist');

const app = new cdk.App();
const env = { account: readDeployAccount(), region: REGION };

const dataStack = new CheckoutDataStack(app, `${STACK_PREFIX}DataStack`, { env });
const backendStack = new CheckoutBackendStack(app, `${STACK_PREFIX}BackendStack`, {
  env,
  vpc: dataStack.vpc,
  lambdaSecurityGroup: dataStack.lambdaSecurityGroup,
  dbSecret: dataStack.dbSecret,
  appSecrets: dataStack.appSecrets,
  deployEnv,
  lambdaBundlePath,
});
new CheckoutFrontendStack(app, `${STACK_PREFIX}FrontendStack`, {
  env,
  httpApi: backendStack.httpApi,
  deployEnv,
  webDistPath,
});
