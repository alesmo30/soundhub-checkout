import type { Municipality, Warehouse } from '../../../../locations';
import type { Delivery } from '../../../domain/delivery';
import { toDeliveryView } from './to-delivery-view';

function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery-1',
    transactionId: 'tx-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '05001',
    status: 'READY_TO_SHIP',
    recipientName: 'Jane Doe',
    phone: '3000000000',
    addressLine: 'Calle 1 # 2-3',
    addressDetail: 'Apto 4B',
    distanceKm: 5,
    feeRule: 'FREE_METRO',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

const WAREHOUSE: Warehouse = {
  id: 'warehouse-1',
  name: 'Bodega Medellín',
  municipalityCode: '05001',
  address: 'Cra 1 # 2-3',
  latitude: 6.25,
  longitude: -75.56,
};

const WAREHOUSE_MUNICIPALITY: Municipality = {
  code: '05001',
  name: 'Medellín',
  departmentCode: '05',
  departmentName: 'Antioquia',
  latitude: 6.25,
  longitude: -75.56,
  isMetroArea: true,
};

const DESTINATION: Municipality = {
  code: '11001',
  name: 'Bogotá',
  departmentCode: '11',
  departmentName: 'Bogotá D.C.',
  latitude: 4.71,
  longitude: -74.07,
  isMetroArea: false,
};

describe('toDeliveryView', () => {
  it('maps warehouse (origin) and destination fields from the right source entity', () => {
    const delivery = buildDelivery();

    const view = toDeliveryView({
      delivery,
      warehouse: WAREHOUSE,
      warehouseMunicipality: WAREHOUSE_MUNICIPALITY,
      destination: DESTINATION,
    });

    expect(view).toEqual({
      id: 'delivery-1',
      transactionId: 'tx-1',
      status: 'READY_TO_SHIP',
      warehouse: {
        id: 'warehouse-1',
        name: 'Bodega Medellín',
        municipalityName: 'Medellín',
      },
      destination: {
        recipientName: 'Jane Doe',
        addressLine: 'Calle 1 # 2-3',
        addressDetail: 'Apto 4B',
        municipalityName: 'Bogotá',
        departmentName: 'Bogotá D.C.',
      },
      distanceKm: 5,
      feeRule: 'FREE_METRO',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    });
  });

  it('keeps a null addressDetail as null, never empty string or omitted', () => {
    const delivery = buildDelivery({ addressDetail: null });

    const view = toDeliveryView({
      delivery,
      warehouse: WAREHOUSE,
      warehouseMunicipality: WAREHOUSE_MUNICIPALITY,
      destination: DESTINATION,
    });

    expect(view.destination.addressDetail).toBeNull();
    expect('addressDetail' in view.destination).toBe(true);
  });
});
