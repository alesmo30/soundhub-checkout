import { Controller, Get, Param, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { DeliveryView } from '@checkout/shared/contracts';
import type { Response } from 'express';

import { respond } from '../../../../shared/infrastructure/http/respond';
import { GetDeliveryUseCase } from '../../application/use-cases/get-delivery.use-case';
import { DELIVERIES_CACHE_CONTROL } from './deliveries-http.constants';
import { DeliveryIdParamsDto } from './dto/delivery-id.params.dto';
import { DeliveryViewResponseDto } from './dto/delivery-view-response.dto';

@ApiTags('deliveries')
@Controller('deliveries')
export class DeliveriesController {
  constructor(private readonly getDeliveryUseCase: GetDeliveryUseCase) {}

  // Cache-Control is set on the response object after respond() resolves,
  // following ProductsController's technique: a thrown DomainErrorException
  // (400/404) never sees this code, so the header never leaks onto an error.
  @Get(':id')
  @ApiOkResponse({ type: DeliveryViewResponseDto })
  @ApiBadRequestResponse({ description: 'id is not a UUID v4.' })
  @ApiNotFoundResponse({ description: 'No delivery with this id exists.' })
  async detail(
    @Param() params: DeliveryIdParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: DeliveryView }> {
    const view = await respond(this.getDeliveryUseCase.execute(params.id));
    response.header('Cache-Control', DELIVERIES_CACHE_CONTROL);
    return view;
  }
}
