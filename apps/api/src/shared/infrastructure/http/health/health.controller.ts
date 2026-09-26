import { Controller, Get } from '@nestjs/common';
import type { ApiResponse, HealthStatus } from '@checkout/shared/contracts';

@Controller('health')
export class HealthController {
  @Get()
  check(): ApiResponse<Omit<HealthStatus, 'database'>> {
    return { data: { status: 'ok' } };
  }
}
