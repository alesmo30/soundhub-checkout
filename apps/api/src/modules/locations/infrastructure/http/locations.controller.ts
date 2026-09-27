import { Controller, Get, Param, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Department, Municipality } from '@checkout/shared/contracts';
import type { Response } from 'express';

import { respond } from '../../../../shared/infrastructure/http/respond';
import { ListDepartmentsUseCase } from '../../application/use-cases/list-departments.use-case';
import { ListMunicipalitiesUseCase } from '../../application/use-cases/list-municipalities.use-case';
import { DepartmentCodeParamsDto } from './dto/department-code.params.dto';
import {
  DepartmentListResponseDto,
  MunicipalityListResponseDto,
} from './dto/location-responses.dto';
import { LOCATIONS_CACHE_CONTROL } from './locations-http.constants';

@ApiTags('locations')
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly listDepartmentsUseCase: ListDepartmentsUseCase,
    private readonly listMunicipalitiesUseCase: ListMunicipalitiesUseCase,
  ) {}

  // @Header() sets the response header before the handler runs, so it would leak onto
  // validation failures too. Setting it manually after a successful respond() call keeps
  // it off every 400/404, which the ProblemDetailsFilter builds from a thrown exception.
  @Get('departments')
  @ApiOkResponse({ type: DepartmentListResponseDto })
  async listDepartments(
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: Department[] }> {
    const departments = await respond(this.listDepartmentsUseCase.execute());
    response.header('Cache-Control', LOCATIONS_CACHE_CONTROL);
    return departments;
  }

  @Get('departments/:code/municipalities')
  @ApiOkResponse({ type: MunicipalityListResponseDto })
  @ApiBadRequestResponse({ description: 'code is not 2 digits.' })
  @ApiNotFoundResponse({ description: 'No municipalities exist for this department code.' })
  async listMunicipalities(
    @Param() params: DepartmentCodeParamsDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ data: Municipality[] }> {
    const municipalities = await respond(this.listMunicipalitiesUseCase.execute(params.code));
    response.header('Cache-Control', LOCATIONS_CACHE_CONTROL);
    return municipalities;
  }
}
