import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { Quote } from '@checkout/shared/contracts';
import type { Response } from 'express';

import { respond } from '../../../../shared/infrastructure/http/respond';
import { GetQuoteUseCase } from '../../application/use-cases/get-quote.use-case';
import { GetQuoteQueryDto } from './dto/get-quote.query.dto';
import { QuoteResponseDto } from './dto/quote-response.dto';
import { QUOTES_CACHE_CONTROL } from './pricing-http.constants';

@ApiTags('quotes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly getQuoteUseCase: GetQuoteUseCase) {}

  // @Header() sets the response header before the handler runs, so it would leak onto
  // validation failures too. Setting it manually after a successful respond() call keeps
  // it off every 400/422/409, which the ProblemDetailsFilter builds from a thrown exception.
  @Get()
  @ApiOkResponse({ type: QuoteResponseDto })
  @ApiBadRequestResponse({
    description:
      'productId is not a UUID v4, quantity is out of range, or municipalityCode is malformed.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'The product or the municipality does not exist.',
  })
  @ApiConflictResponse({ description: 'The requested quantity exceeds the available stock.' })
  async quote(
    @Query() query: GetQuoteQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: Quote }> {
    const quote = await respond(this.getQuoteUseCase.execute(query));
    response.header('Cache-Control', QUOTES_CACHE_CONTROL);
    return quote;
  }
}
