import { join } from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';
import type { DeployEnv } from './config/deploy-env';
import { PROJECT_TAG } from './config/constants';

const SPA_REWRITE_FUNCTION_PATH = join(__dirname, 'functions/spa-rewrite.js');

const PERMISSIONS_POLICY_VALUE = 'camera=(), microphone=(), geolocation=()';

export interface FrontendStackProps extends cdk.StackProps {
  httpApi: apigatewayv2.IHttpApi;
  deployEnv: DeployEnv;
  webDistPath: string;
}

export class CheckoutFrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add(PROJECT_TAG.key, PROJECT_TAG.value);

    const { httpApi, deployEnv, webDistPath } = props;

    const bucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const spaRewriteFunction = new cloudfront.Function(this, 'SpaRewriteFunction', {
      code: cloudfront.FunctionCode.fromFile({ filePath: SPA_REWRITE_FUNCTION_PATH }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    const strictSpaHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'StrictSpaHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: cdk.Duration.seconds(63_072_000),
          includeSubdomains: true,
          preload: true,
        },
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy:
            `default-src 'self'; connect-src 'self' ${deployEnv.paymentGatewayUrl}; ` +
            "img-src 'self' data:; font-src 'self'; object-src 'none'; " +
            "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: {
          override: true,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: PERMISSIONS_POLICY_VALUE, override: true },
          { header: 'Cross-Origin-Opener-Policy', value: 'same-origin', override: true },
        ],
      },
    });

    // No override and no CSP here: helmet keeps deciding CSP per path so
    // Swagger UI's inline scripts at /api/docs keep working (see Decisions,
    // "Networking and edge").
    const apiHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'ApiHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          override: false,
          accessControlMaxAge: cdk.Duration.seconds(63_072_000),
          includeSubdomains: true,
          preload: true,
        },
        referrerPolicy: {
          override: false,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.NO_REFERRER,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: PERMISSIONS_POLICY_VALUE, override: false },
        ],
      },
    });

    const s3Origin = origins.S3BucketOrigin.withOriginAccessControl(bucket);
    const apiOrigin = new origins.HttpOrigin(
      cdk.Fn.select(2, cdk.Fn.split('/', httpApi.apiEndpoint)),
    );

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: s3Origin,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: strictSpaHeadersPolicy,
        functionAssociations: [
          { function: spaRewriteFunction, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
        ],
      },
      additionalBehaviors: {
        '/images/*': {
          origin: s3Origin,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: strictSpaHeadersPolicy,
          functionAssociations: [
            {
              function: spaRewriteFunction,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        '/api/*': {
          origin: apiOrigin,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          responseHeadersPolicy: apiHeadersPolicy,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        },
      },
    });

    new s3deploy.BucketDeployment(this, 'WebDeployment', {
      sources: [s3deploy.Source.asset(webDistPath)],
      destinationBucket: bucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${distribution.distributionDomainName}`,
    });
    new cdk.CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
  }
}
