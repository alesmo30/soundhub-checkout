import { join } from 'node:path';
import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CheckoutFrontendStack } from '../lib/frontend-stack';
import type { DeployEnv } from '../lib/config/deploy-env';

const FAKE_ENV = { account: '111111111111', region: 'us-east-1' };
const FAKE_DEPLOY_ENV: DeployEnv = {
  paymentGatewayUrl: 'https://gateway.example.test',
  paymentGatewayPublicKey: 'pub_test_key',
  smtpHost: 'smtp.example.test',
  smtpPort: 465,
  emailFrom: 'SoundHub <no-reply@example.test>',
};
const WEB_DIST_PATH = join(__dirname, 'fixtures/web-dist');

const CACHING_DISABLED_POLICY_ID = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad';
const ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID = 'b689b0a8-53d0-40ab-baf2-68738e2966ac';

function synthFrontendStack(): Template {
  const app = new App();
  const stack = new CheckoutFrontendStack(app, 'TestFrontendStack', {
    env: FAKE_ENV,
    httpApi: {
      apiEndpoint: 'https://abc123.execute-api.us-east-1.amazonaws.com',
      httpApiId: 'abc123',
    } as never,
    deployEnv: FAKE_DEPLOY_ENV,
    webDistPath: WEB_DIST_PATH,
  });

  return Template.fromStack(stack);
}

interface DistributionResource {
  Properties: {
    DistributionConfig: {
      DefaultCacheBehavior: Record<string, unknown>;
      CacheBehaviors?: Array<Record<string, unknown>>;
      CustomErrorResponses?: unknown[];
    };
  };
}

function getDistributionConfig(
  template: Template,
): DistributionResource['Properties']['DistributionConfig'] {
  const distributions = template.findResources('AWS::CloudFront::Distribution');
  const distribution = Object.values(distributions)[0] as DistributionResource;
  return distribution.Properties.DistributionConfig;
}

describe('CheckoutFrontendStack', () => {
  it('blocks all public access on the web bucket', () => {
    const template = synthFrontendStack();

    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  it('uses CachingDisabled and AllViewerExceptHostHeader on /api/* with no function association', () => {
    const template = synthFrontendStack();
    const config = getDistributionConfig(template);
    const apiBehavior = (config.CacheBehaviors ?? []).find(
      (behavior) => behavior['PathPattern'] === '/api/*',
    ) as Record<string, unknown>;

    expect(apiBehavior).toBeDefined();
    expect(apiBehavior['CachePolicyId']).toBe(CACHING_DISABLED_POLICY_ID);
    expect(apiBehavior['OriginRequestPolicyId']).toBe(ALL_VIEWER_EXCEPT_HOST_HEADER_POLICY_ID);
    expect(apiBehavior['FunctionAssociations']).toBeUndefined();
  });

  it('associates the SPA rewrite function only with the S3 behaviors', () => {
    const template = synthFrontendStack();
    const config = getDistributionConfig(template);

    expect(config.DefaultCacheBehavior['FunctionAssociations']).toEqual(
      expect.arrayContaining([expect.objectContaining({ EventType: 'viewer-request' })]),
    );

    const imagesBehavior = (config.CacheBehaviors ?? []).find(
      (behavior) => behavior['PathPattern'] === '/images/*',
    ) as Record<string, unknown>;
    expect(imagesBehavior['FunctionAssociations']).toEqual(
      expect.arrayContaining([expect.objectContaining({ EventType: 'viewer-request' })]),
    );

    const apiBehavior = (config.CacheBehaviors ?? []).find(
      (behavior) => behavior['PathPattern'] === '/api/*',
    ) as Record<string, unknown>;
    expect(apiBehavior['FunctionAssociations']).toBeUndefined();
  });

  it('gives StrictSpaHeaders an override CSP with the injected gateway URL', () => {
    const template = synthFrontendStack();

    template.hasResourceProperties(
      'AWS::CloudFront::ResponseHeadersPolicy',
      Match.objectLike({
        ResponseHeadersPolicyConfig: Match.objectLike({
          Name: Match.stringLikeRegexp('StrictSpaHeaders'),
          SecurityHeadersConfig: Match.objectLike({
            ContentSecurityPolicy: Match.objectLike({
              Override: true,
              ContentSecurityPolicy: Match.stringLikeRegexp('https://gateway\\.example\\.test'),
            }),
          }),
        }),
      }),
    );
  });

  it('gives ApiHeaders no CSP and no override', () => {
    const template = synthFrontendStack();

    const policies = template.findResources('AWS::CloudFront::ResponseHeadersPolicy');
    const apiHeadersPolicy = Object.values(policies).find((policy) => {
      const config = (policy as { Properties: { ResponseHeadersPolicyConfig: { Name: string } } })
        .Properties.ResponseHeadersPolicyConfig;
      return config.Name.includes('ApiHeaders');
    }) as {
      Properties: {
        ResponseHeadersPolicyConfig: {
          SecurityHeadersConfig?: Record<string, unknown>;
        };
      };
    };

    expect(apiHeadersPolicy).toBeDefined();
    const securityHeaders =
      apiHeadersPolicy.Properties.ResponseHeadersPolicyConfig.SecurityHeadersConfig ?? {};
    expect(securityHeaders).not.toHaveProperty('ContentSecurityPolicy');

    const hsts = securityHeaders['StrictTransportSecurity'] as { Override: boolean } | undefined;
    expect(hsts?.Override).toBe(false);
  });

  it('has no custom error response on the distribution', () => {
    const template = synthFrontendStack();
    const config = getDistributionConfig(template);

    expect(config.CustomErrorResponses ?? []).toHaveLength(0);
  });
});
