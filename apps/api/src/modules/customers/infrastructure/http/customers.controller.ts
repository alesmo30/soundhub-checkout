import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Customer } from '@checkout/shared/contracts';
import type { Response } from 'express';

import { respond } from '../../../../shared/infrastructure/http/respond';
import { GetCustomerUseCase } from '../../application/use-cases/get-customer.use-case';
import { UpsertCustomerUseCase } from '../../application/use-cases/upsert-customer.use-case';
import { CUSTOMERS_CACHE_CONTROL } from './customers-http.constants';
import { CustomerIdParamsDto } from './dto/customer-id.params.dto';
import { CustomerResponseDto } from './dto/customer-response.dto';
import { UpsertCustomerDto } from './dto/upsert-customer.dto';

@ApiTags('customers')
@Controller('customers')
export class CustomersController {
  constructor(
    private readonly upsertCustomerUseCase: UpsertCustomerUseCase,
    private readonly getCustomerUseCase: GetCustomerUseCase,
  ) {}

  // @Header() sets the response header before the handler runs, so it would leak onto
  // validation failures too. Setting it manually after a successful respond() call keeps
  // it off every 400/409, which the ProblemDetailsFilter builds from a thrown exception.
  @Post()
  @ApiCreatedResponse({ description: 'A new customer was created.', type: CustomerResponseDto })
  @ApiOkResponse({
    description: 'An existing customer was found and its contact info updated.',
    type: CustomerResponseDto,
  })
  @ApiBadRequestResponse({ description: 'A field is malformed or an unknown field was sent.' })
  @ApiConflictResponse({
    description: 'EMAIL_ALREADY_REGISTERED or CUSTOMER_DATA_MISMATCH.',
  })
  async upsert(
    @Body() dto: UpsertCustomerDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: Customer }> {
    const { data } = await respond(this.upsertCustomerUseCase.execute(dto));
    response.status(data.created ? 201 : 200);
    response.header('Cache-Control', CUSTOMERS_CACHE_CONTROL);
    return { data: data.customer };
  }

  @Get(':id')
  @ApiOkResponse({ type: CustomerResponseDto })
  @ApiBadRequestResponse({ description: 'id is not a UUID v4.' })
  @ApiNotFoundResponse({ description: 'No customer with this id exists.' })
  async getById(
    @Param() params: CustomerIdParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: Customer }> {
    const customer = await respond(this.getCustomerUseCase.execute(params.id));
    response.header('Cache-Control', CUSTOMERS_CACHE_CONTROL);
    return customer;
  }
}
