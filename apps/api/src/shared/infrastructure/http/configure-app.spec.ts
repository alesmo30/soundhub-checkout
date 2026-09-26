import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ProblemDetails } from '@checkout/shared/contracts';
import { ErrorCode } from '@checkout/shared/enums';
import { Type } from 'class-transformer';
import { IsString, ValidateNested } from 'class-validator';
import request from 'supertest';

import { DomainError } from '../../domain/domain-error';
import { configureApp } from './configure-app';
import { DomainErrorException } from './domain-error.exception';

class PaymentDto {
  @IsString()
  cardLast4!: string;
}

class EchoDto {
  @IsString()
  name!: string;

  @ValidateNested()
  @Type(() => PaymentDto)
  payment!: PaymentDto;
}

@Controller('test')
class TestOnlyController {
  @Post('echo')
  echo(@Body() body: EchoDto): { data: EchoDto } {
    return { data: body };
  }

  @Get('domain-error')
  domainError(): never {
    throw new DomainErrorException(
      new DomainError(ErrorCode.PRODUCT_NOT_FOUND, 'NOT_FOUND', 'Product not found.'),
    );
  }

  @Get('boom')
  boom(): never {
    throw new Error('unexpected failure with a sensitive detail');
  }
}

function asProblem(body: unknown): ProblemDetails {
  return body as ProblemDetails;
}

describe('configureApp', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestOnlyController],
    }).compile();

    app = moduleRef.createNestApplication({ bodyParser: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects an unknown field with 400 and a Problem Details errors[] entry', async () => {
    const response = await request(server)
      .post('/api/v1/test/echo')
      .send({ name: 'Ana', payment: { cardLast4: '1234' }, extra: 'nope' });
    const problem = asProblem(response.body);

    expect(response.status).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(problem.code).toBe('VALIDATION_ERROR');
    expect(problem.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'extra' })]),
    );
  });

  it('reports a nested validation failure with a dotted field path', async () => {
    const response = await request(server)
      .post('/api/v1/test/echo')
      .send({ name: 'Ana', payment: { cardLast4: 1234 } });
    const problem = asProblem(response.body);

    expect(response.status).toBe(400);
    expect(problem.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'payment.cardLast4' })]),
    );
  });

  it('maps a DomainError to its HTTP status via DomainErrorMapper', async () => {
    const response = await request(server).get('/api/v1/test/domain-error');
    const problem = asProblem(response.body);

    expect(response.status).toBe(404);
    expect(problem).toMatchObject({
      code: 'PRODUCT_NOT_FOUND',
      status: 404,
      detail: 'Product not found.',
    });
    expect(problem.traceId).toBeTruthy();
  });

  it('returns a 500 with no stack trace and no original message for an unexpected error', async () => {
    const response = await request(server).get('/api/v1/test/boom');
    const problem = asProblem(response.body);

    expect(response.status).toBe(500);
    expect(problem.code).toBe('INTERNAL_ERROR');
    expect((problem as unknown as { stack?: unknown }).stack).toBeUndefined();
    expect(JSON.stringify(problem)).not.toContain('sensitive detail');
  });
});
