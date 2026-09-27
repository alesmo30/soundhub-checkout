import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, Min, validateSync } from 'class-validator';

export type NodeEnv = 'development' | 'test' | 'production';
export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export const NODE_ENVS: readonly NodeEnv[] = ['development', 'test', 'production'];
export const LOG_LEVELS: readonly LogLevel[] = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];

export class EnvironmentVariables {
  @IsIn(NODE_ENVS)
  NODE_ENV!: NodeEnv;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsIn(LOG_LEVELS)
  LOG_LEVEL!: LogLevel;

  @IsString()
  DB_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;

  @IsString()
  PAYMENT_GATEWAY_URL!: string;

  @IsString()
  PAYMENT_GATEWAY_PUBLIC_KEY!: string;

  @IsString()
  PAYMENT_GATEWAY_PRIVATE_KEY!: string;

  @IsString()
  PAYMENT_GATEWAY_INTEGRITY_SECRET!: string;

  @IsString()
  PAYMENT_GATEWAY_EVENTS_SECRET!: string;

  @IsString()
  SMTP_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT!: number;

  @IsString()
  SMTP_USER!: string;

  @IsString()
  SMTP_PASSWORD!: string;

  @IsString()
  EMAIL_FROM!: string;
}

function assertNoErrors(errors: { property: string }[]): void {
  if (errors.length > 0) {
    const invalidNames = errors.map((error) => error.property).join(', ');
    throw new Error(`Invalid environment configuration. Check: ${invalidNames}`);
  }
}

export function validateEnvironmentVariables(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  assertNoErrors(validateSync(validated, { skipMissingProperties: false }));

  return validated;
}

// Only the `db` group: used by the TypeORM CLI and integration tests, which
// open a DataSource and nothing else, so CI needs no gateway or SMTP values
// for that job (see specs/02-api-app-foundation.md, Decisions > Bootstrap).
export class DbEnvironmentVariables {
  @IsString()
  DB_HOST!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT!: number;

  @IsString()
  DB_USERNAME!: string;

  @IsString()
  DB_PASSWORD!: string;

  @IsString()
  DB_NAME!: string;
}

export function validateDbEnvironmentVariables(
  config: Record<string, unknown>,
): DbEnvironmentVariables {
  const validated = plainToInstance(DbEnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  assertNoErrors(validateSync(validated, { skipMissingProperties: false }));

  return validated;
}
