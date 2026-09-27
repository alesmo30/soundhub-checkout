import { Controller, Get, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ApiResponse, HealthStatus } from '@checkout/shared/contracts';
import type { Response } from 'express';
import type { DataSource } from 'typeorm';

@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async check(@Res({ passthrough: true }) response: Response): Promise<ApiResponse<HealthStatus>> {
    const database = await this.checkDatabase();

    response.status(database === 'up' ? 200 : 503);

    return { data: { status: 'ok', database } };
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.dataSource.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
