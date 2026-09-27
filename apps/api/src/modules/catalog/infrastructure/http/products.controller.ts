import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Paginated, ProductDetail, ProductSummary } from '@checkout/shared/contracts';
import type { Response } from 'express';

import { respond, respondPaginated } from '../../../../shared/infrastructure/http/respond';
import { GetProductDetailUseCase } from '../../application/use-cases/get-product-detail.use-case';
import { ListProductsUseCase } from '../../application/use-cases/list-products.use-case';
import { PRODUCTS_CACHE_CONTROL } from './catalog-http.constants';
import { ListProductsQueryDto } from './dto/list-products.query.dto';
import { ProductIdParamsDto } from './dto/product-id.params.dto';
import {
  PaginatedProductsResponseDto,
  ProductDetailResponseDto,
} from './dto/product-responses.dto';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductDetailUseCase: GetProductDetailUseCase,
  ) {}

  // @Header() sets the response header before the handler runs, so it would leak onto
  // validation failures too. Setting it manually after a successful respond*() call keeps
  // it off every 400/404, which the ProblemDetailsFilter builds from a thrown exception.
  @Get()
  @ApiOkResponse({ type: PaginatedProductsResponseDto })
  @ApiBadRequestResponse({ description: 'page or limit is out of range or not a number.' })
  async list(
    @Query() query: ListProductsQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Paginated<ProductSummary>> {
    const page = await respondPaginated(this.listProductsUseCase.execute(query));
    response.header('Cache-Control', PRODUCTS_CACHE_CONTROL);
    return page;
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiBadRequestResponse({ description: 'id is not a UUID v4.' })
  @ApiNotFoundResponse({ description: 'No product with this id exists or it was soft-deleted.' })
  async detail(
    @Param() params: ProductIdParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: ProductDetail }> {
    const detail = await respond(this.getProductDetailUseCase.execute(params.id));
    response.header('Cache-Control', PRODUCTS_CACHE_CONTROL);
    return detail;
  }
}
