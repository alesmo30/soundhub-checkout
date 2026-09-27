import { randomUUID } from 'node:crypto';

import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { REQUEST_ID_PATTERN } from '../../../config/app.constants';

const REQUEST_ID_HEADER = 'x-request-id';

export function resolveRequestId(incoming: string | undefined): string {
  return incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const existing = typeof request.id === 'string' ? request.id : undefined;
    const id = existing ?? resolveRequestId(request.header(REQUEST_ID_HEADER));

    request.id = id;
    response.setHeader('X-Request-Id', id);

    next();
  }
}
