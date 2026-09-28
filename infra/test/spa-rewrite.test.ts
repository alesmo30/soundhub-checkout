import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

interface CloudFrontRequest {
  uri: string;
  method: string;
  headers: Record<string, unknown>;
  querystring: Record<string, unknown>;
}

interface CloudFrontViewerRequestEvent {
  request: CloudFrontRequest;
}

type Handler = (event: CloudFrontViewerRequestEvent) => CloudFrontRequest;

function loadHandler(): Handler {
  const source = readFileSync(join(__dirname, '../lib/functions/spa-rewrite.js'), 'utf8');
  const context: { handler?: Handler } = {};
  runInNewContext(`${source}\nthis.handler = handler;`, context);

  if (!context.handler) {
    throw new Error('spa-rewrite.js did not define a handler function');
  }

  return context.handler;
}

function buildEvent(uri: string): CloudFrontViewerRequestEvent {
  return { request: { uri, method: 'GET', headers: {}, querystring: {} } };
}

describe('spa-rewrite CloudFront function', () => {
  const handler = loadHandler();

  it.each(['/products/abc', '/'])('rewrites %s to /index.html', (uri) => {
    const result = handler(buildEvent(uri));

    expect(result.uri).toBe('/index.html');
  });

  it.each(['/assets/x.js', '/images/products/y.webp', '/favicon.ico'])(
    'leaves %s unchanged',
    (uri) => {
      const result = handler(buildEvent(uri));

      expect(result.uri).toBe(uri);
    },
  );
});
