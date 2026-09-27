import { ApiProperty } from '@nestjs/swagger';
import type {
  Paginated,
  PaginationMeta,
  ProductDetail,
  ProductSummary,
} from '@checkout/shared/contracts';

import { PaginationMetaDto } from './pagination-meta.dto';
import { ProductDetailDto } from './product-detail.dto';
import { ProductSummaryDto } from './product-summary.dto';

// Property types stay on the @checkout/shared/contracts interfaces (a package import) rather
// than the sibling DTO classes: the @nestjs/swagger CLI plugin's AOT metadata factory resolves
// a *relative* class-typed property through its ESM-lazy-import path, which the Nest CLI's
// CommonJS webpack build cannot follow. The @ApiProperty `type` option still drives the schema.
export class PaginatedProductsResponseDto implements Paginated<ProductSummary> {
  @ApiProperty({ type: [ProductSummaryDto] })
  data!: ProductSummary[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMeta;
}

export class ProductDetailResponseDto {
  @ApiProperty({ type: ProductDetailDto })
  data!: ProductDetail;
}
