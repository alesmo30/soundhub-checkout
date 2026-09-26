import type { Request, Response } from 'express';

import { resolveRequestId, RequestIdMiddleware } from './request-id.middleware';

function fakeRequest(
  overrides: Partial<{ id: string; header: (name: string) => string | undefined }> = {},
) {
  return {
    id: overrides.id,
    header: overrides.header ?? (() => undefined),
  } as unknown as Request & { id?: string };
}

function fakeResponse() {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe('resolveRequestId', () => {
  it('accepts a valid incoming id and echoes it unchanged', () => {
    expect(resolveRequestId('abc-123.XYZ_1')).toBe('abc-123.XYZ_1');
  });

  it('generates a fresh uuid when no id is provided', () => {
    const id = resolveRequestId(undefined);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an id that breaks the pattern and generates a new one instead', () => {
    const id = resolveRequestId('bad id with spaces');
    expect(id).not.toBe('bad id with spaces');
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('RequestIdMiddleware', () => {
  it('echoes an incoming valid id back as a response header', () => {
    const middleware = new RequestIdMiddleware();
    const request = fakeRequest({ header: () => 'client-supplied-id' });
    const response = fakeResponse();
    const next = jest.fn<void, []>();

    middleware.use(request, response, next);

    expect(response.headers['X-Request-Id']).toBe('client-supplied-id');
    expect(request.id).toBe('client-supplied-id');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reuses an id already resolved upstream (e.g. by the logger) instead of generating a new one', () => {
    const middleware = new RequestIdMiddleware();
    const request = fakeRequest({ id: 'already-resolved-id' });
    const response = fakeResponse();
    const next = jest.fn<void, []>();

    middleware.use(request, response, next);

    expect(response.headers['X-Request-Id']).toBe('already-resolved-id');
  });

  it('generates a fresh id when the request has none and no header was sent', () => {
    const middleware = new RequestIdMiddleware();
    const request = fakeRequest();
    const response = fakeResponse();
    const next = jest.fn<void, []>();

    middleware.use(request, response, next);

    expect(response.headers['X-Request-Id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
