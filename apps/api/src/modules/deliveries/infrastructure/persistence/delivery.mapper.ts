import type { Delivery } from '../../domain/delivery';
import type { DeliveryOrmEntity } from './delivery.orm-entity';

export function toDelivery(entity: DeliveryOrmEntity): Delivery {
  return {
    id: entity.id,
    transactionId: entity.transactionId,
    warehouseId: entity.warehouseId,
    municipalityCode: entity.municipalityCode,
    status: entity.status,
    recipientName: entity.recipientName,
    phone: entity.phone,
    addressLine: entity.addressLine,
    addressDetail: entity.addressDetail,
    distanceKm: entity.distanceKm,
    feeRule: entity.feeRule,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    deletedAt: entity.deletedAt,
  };
}
