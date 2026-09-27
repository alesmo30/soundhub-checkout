import type { Warehouse } from '../../domain/warehouse';
import type { WarehouseOrmEntity } from './warehouse.orm-entity';

export function toWarehouse(entity: WarehouseOrmEntity): Warehouse {
  return {
    id: entity.id,
    name: entity.name,
    municipalityCode: entity.municipalityCode,
    address: entity.address,
    latitude: entity.latitude,
    longitude: entity.longitude,
  };
}
