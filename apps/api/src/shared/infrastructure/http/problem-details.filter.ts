import { randomUUID } from 'node:crypto';

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { BadRequestException, Catch, HttpException, HttpStatus } from '@nestjs/common';
import type { FieldError, ProblemDetails } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import type { Request, Response } from 'express';

import { DomainErrorException } from './domain-error.exception';
import { DomainErrorMapper } from './domain-error.mapper';

const PROBLEM_TYPE_BASE_URL = 'https://errors.checkout.dev';
const INTERNAL_ERROR_DETAIL = 'An unexpected error occurred.';

function toKebabCase(code: string): string {
  return code.toLowerCase().replace(/_/g, '-');
}

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { id?: string }>();
    const response = context.getResponse<Response>();
    const traceId = request.id ?? randomUUID();

    const problem = this.buildProblemDetails(exception, traceId);

    response.status(problem.status).type('application/problem+json').send(problem);
  }

  private buildProblemDetails(exception: unknown, traceId: string): ProblemDetails {
    if (exception instanceof DomainErrorException) {
      const { domainError } = exception;
      return this.problem({
        code: domainError.code,
        status: DomainErrorMapper.toHttpStatus(domainError),
        detail: domainError.detail,
        traceId,
      });
    }

    if (exception instanceof BadRequestException) {
      return this.problem({
        code: ErrorCode.VALIDATION_ERROR,
        status: HttpStatus.BAD_REQUEST,
        detail: 'Validation failed.',
        traceId,
        errors: this.extractFieldErrors(exception),
      });
    }

    if (exception instanceof HttpException) {
      return this.problem({
        code: ErrorCode.VALIDATION_ERROR,
        status: exception.getStatus(),
        detail: this.extractMessage(exception),
        traceId,
      });
    }

    // body-parser (e.g. a body over BODY_LIMIT) raises a plain http-errors
    // instance, not a Nest HttpException; `expose: true` is its own signal
    // that the status and message are safe to return as-is.
    if (this.isExposableHttpError(exception)) {
      return this.problem({
        code: ErrorCode.VALIDATION_ERROR,
        status: exception.status,
        detail: exception.message,
        traceId,
      });
    }

    return this.problem({
      code: ErrorCode.INTERNAL_ERROR,
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: INTERNAL_ERROR_DETAIL,
      traceId,
    });
  }

  private isExposableHttpError(error: unknown): error is { status: number; message: string } {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as Record<string, unknown>).expose === true &&
      typeof (error as Record<string, unknown>).status === 'number'
    );
  }

  private problem(params: {
    code: ErrorCode;
    status: number;
    detail: string;
    traceId: string;
    errors?: FieldError[];
  }): ProblemDetails {
    const { code, status, detail, traceId, errors } = params;
    return {
      type: `${PROBLEM_TYPE_BASE_URL}/${toKebabCase(code)}`,
      title: DomainErrorMapper.toTitle(code),
      status,
      code,
      detail,
      traceId,
      ...(errors && errors.length > 0 ? { errors } : {}),
    };
  }

  private extractFieldErrors(exception: BadRequestException): FieldError[] | undefined {
    const response = exception.getResponse();

    if (typeof response === 'object' && response !== null && 'errors' in response) {
      return (response as { errors: FieldError[] }).errors;
    }

    return undefined;
  }

  private extractMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') {
      return response;
    }

    if (typeof response === 'object' && response !== null && 'message' in response) {
      const { message } = response;
      return typeof message === 'string' ? message : exception.message;
    }

    return exception.message;
  }
}
