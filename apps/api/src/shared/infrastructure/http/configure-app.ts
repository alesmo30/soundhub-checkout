import type { INestApplication } from '@nestjs/common';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { FieldError } from '@checkout/shared/contracts';
import type { ValidationError } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';
import { json, urlencoded } from 'express';
import helmet from 'helmet';

import { API_PREFIX, BODY_LIMIT, DOCS_PATH } from '../../../config/app.constants';
import { ProblemDetailsFilter } from './problem-details.filter';

function flattenValidationErrors(errors: ValidationError[], parentPath = ''): FieldError[] {
  return errors.flatMap((error) => {
    const path = parentPath ? `${parentPath}.${error.property}` : error.property;

    if (error.children && error.children.length > 0) {
      return flattenValidationErrors(error.children, path);
    }

    const messages = error.constraints ? Object.values(error.constraints) : ['Invalid value.'];
    return messages.map((message) => ({ field: path, message }));
  });
}

function docsAwareHelmet(request: Request, response: Response, next: NextFunction): void {
  const isDocsRequest =
    request.path === `/${DOCS_PATH}` || request.path.startsWith(`/${DOCS_PATH}/`);
  const middleware = isDocsRequest ? helmet({ contentSecurityPolicy: false }) : helmet();

  middleware(request, response, next);
}

export function configureApp(app: INestApplication): void {
  app.use(docsAwareHelmet);
  app.use(json({ limit: BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: BODY_LIMIT }));

  app.setGlobalPrefix(API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: false,
      exceptionFactory: (errors) =>
        new BadRequestException({ errors: flattenValidationErrors(errors) }),
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());
}
