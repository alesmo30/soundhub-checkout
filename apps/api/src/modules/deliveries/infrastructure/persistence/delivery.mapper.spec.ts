import { toDelivery } from './delivery.mapper';
import type { DeliveryOrmEntity } from './delivery.orm-entity';

const CREATED_AT = new Date('2026-09-27T20:00:00.000Z');
const UPDATED_AT = new Date('2026-09-27T20:00:01.000Z');

function buildOrmEntity(overrides: Partial<DeliveryOrmEntity> = {}): DeliveryOrmEntity {
  return {
    id: 'delivery-1',
    transactionId: 'tx-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    status: 'AWAITING_PAYMENT',
    recipientName: 'Jane Doe',
    phone: '3001234567',
    addressLine: 'Calle 1 # 2-3',
    addressDetail: 'Apto 401',
    distanceKm: 5,
    feeRule: 'METRO_FLAT',
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    deletedAt: null,
    ...overrides,
  };
}

describe('toDelivery', () => {
  it('maps every ORM entity column to the domain shape', () => {
    const entity = buildOrmEntity();

    expect(toDelivery(entity)).toEqual({
      id: 'delivery-1',
      transactionId: 'tx-1',
      warehouseId: 'warehouse-1',
      municipalityCode: '11001',
      status: 'AWAITING_PAYMENT',
      recipientName: 'Jane Doe',
      phone: '3001234567',
      addressLine: 'Calle 1 # 2-3',
      addressDetail: 'Apto 401',
      distanceKm: 5,
      feeRule: 'METRO_FLAT',
      createdAt: CREATED_AT,
      updatedAt: UPDATED_AT,
      deletedAt: null,
    });
  });

  it('carries a null addressDetail and a soft-deleted deliveredAt through untouched', () => {
    const deletedAt = new Date('2026-09-27T20:10:00.000Z');
    const entity = buildOrmEntity({
      status: 'CANCELLED',
      addressDetail: null,
      deletedAt,
    });

    const result = toDelivery(entity);

    expect(result.status).toBe('CANCELLED');
    expect(result.addressDetail).toBeNull();
    expect(result.deletedAt).toBe(deletedAt);
  });
});
