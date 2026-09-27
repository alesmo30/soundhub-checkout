import { ApiProperty } from '@nestjs/swagger';
import type { Department, Municipality } from '@checkout/shared/contracts';

import { DepartmentDto } from './department.dto';
import { MunicipalityDto } from './municipality.dto';

// Property types stay on the @checkout/shared/contracts interfaces (a package import) rather
// than the sibling DTO classes: the @nestjs/swagger CLI plugin's AOT metadata factory resolves
// a *relative* class-typed property through its ESM-lazy-import path, which the Nest CLI's
// CommonJS webpack build cannot follow. The @ApiProperty `type` option still drives the schema.
export class DepartmentListResponseDto {
  @ApiProperty({ type: [DepartmentDto] })
  data!: Department[];
}

export class MunicipalityListResponseDto {
  @ApiProperty({ type: [MunicipalityDto] })
  data!: Municipality[];
}
