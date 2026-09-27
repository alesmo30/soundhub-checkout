import type { ResultAsync } from '../../../../shared/domain/result';
import type { Warehouse } from '../../domain/warehouse';

export const WAREHOUSE_REPOSITORY = Symbol('WAREHOUSE_REPOSITORY');

export interface WarehouseRepository {
  listActive(): ResultAsync<Warehouse[], never>;
  findById(id: string): ResultAsync<Warehouse | null, never>;
}
