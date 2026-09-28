// @codegenie/serverless-express ships no type declarations of its own
// (its package.json has no "types" field), so `tsc --strict` cannot resolve
// the import without this ambient declaration. Typed against the subset of
// its API this codebase actually calls: `configure({ app })` returning a
// promise-resolution-mode handler for an HTTP API v2 event.
declare module '@codegenie/serverless-express' {
  import type { Application } from 'express';
  import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from 'aws-lambda';

  export interface ServerlessExpressOptions {
    app: Application;
  }

  export default function serverlessExpress(
    options: ServerlessExpressOptions,
  ): (event: APIGatewayProxyEventV2, context: Context) => Promise<APIGatewayProxyResultV2>;
}
