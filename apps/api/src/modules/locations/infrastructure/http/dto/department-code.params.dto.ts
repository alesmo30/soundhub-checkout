import { ApiProperty } from '@nestjs/swagger';
import { DEPARTMENT_CODE_PATTERN } from '@checkout/shared/constants';
import { Matches } from 'class-validator';

export class DepartmentCodeParamsDto {
  @ApiProperty({ pattern: DEPARTMENT_CODE_PATTERN.source, example: '05' })
  @Matches(DEPARTMENT_CODE_PATTERN)
  code!: string;
}
