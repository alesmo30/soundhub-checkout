#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import * as cdk from 'aws-cdk-lib';
import { loadDeployEnv, readDeployAccount } from '../lib/config/deploy-env';
import { REGION, STACK_PREFIX } from '../lib/config/constants';
import { CheckoutDataStack } from '../lib/data-stack';
import { CheckoutBackendStack } from '../lib/backend-stack';
import { CheckoutFrontendStack } from '../lib/frontend-stack';

// Fails synth fast, naming the exact missing variable, before any stack is built.
const rootEnvPath = resolve(__dirname, '../../.env');
loadDeployEnv(parseEnv(readFileSync(rootEnvPath, 'utf-8')));

const app = new cdk.App();
const env = { account: readDeployAccount(), region: REGION };

new CheckoutDataStack(app, `${STACK_PREFIX}DataStack`, { env });
new CheckoutBackendStack(app, `${STACK_PREFIX}BackendStack`, { env });
new CheckoutFrontendStack(app, `${STACK_PREFIX}FrontendStack`, { env });
