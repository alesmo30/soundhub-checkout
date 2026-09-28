import { Logger } from '@nestjs/common';

import type {
  Municipality,
  MunicipalityRepository,
  Warehouse,
  WarehouseRepository,
} from '../../../locations';
import { okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Delivery } from '../../domain/delivery';
import type { DeliveryRepository } from '../ports/delivery.repository.port';
import { GetDeliveryUseCase } from './get-delivery.use-case';

function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: 'delivery-1',
    transactionId: 'tx-1',
    warehouseId: 'warehouse-1',
    municipalityCode: '11001',
    status: 'READY_TO_SHIP',
    recipientName: 'Jane Doe',
    phone: '3000000000',
    addressLine: 'Calle 1 # 2-3',
    addressDetail: null,
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

class FakeDeliveryRepository implements DeliveryRepository {
  constructor(private readonly delivery: Delivery | null) {}

  findById(): ResultAsync<Delivery | null, never> {
    return okAsync(this.delivery);
  }

  findByTransactionId(): never {
    throw new Error('not used by this spec');
  }

  insert(): never {
    throw new Error('not used by this spec');
  }

  transition(): never {
    throw new Error('not used by this spec');
  }
}

class FakeWarehouseRepository implements WarehouseRepository {
  constructor(private readonly warehouse: Warehouse | null) {}

  findById(): ResultAsync<Warehouse | null, never> {
    return okAsync(this.warehouse);
  }

  listActive(): never {
    throw new Error('not used by this spec');
  }
}

// Keyed by municipality code so a single fake can answer both the warehouse
// municipality lookup and the destination lookup with different results.
class FakeMunicipalityRepository implements MunicipalityRepository {
  constructor(private readonly byCode: Record<string, Municipality | null>) {}

  findByCode(code: string): ResultAsync<Municipality | null, never> {
    return okAsync(this.byCode[code] ?? null);
  }

  listDepartments(): never {
    throw new Error('not used by this spec');
  }

  listByDepartment(): never {
    throw new Error('not used by this spec');
  }
}

function buildUseCase(params: {
  deliveryRepository: DeliveryRepository;
  warehouseRepository: WarehouseRepository;
  municipalityRepository: MunicipalityRepository;
}): GetDeliveryUseCase {
  return new GetDeliveryUseCase(
    params.deliveryRepository,
    params.warehouseRepository,
    params.municipalityRepository,
  );
}

describe('GetDeliveryUseCase', () => {
  it('maps the delivery, its warehouse and both municipalities into a DeliveryView', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(buildDelivery()),
      warehouseRepository: new FakeWarehouseRepository(WAREHOUSE),
      municipalityRepository: new FakeMunicipalityRepository({
        '05001': WAREHOUSE_MUNICIPALITY,
        '11001': DESTINATION,
      }),
    });

    const result = await useCase.execute('delivery-1');

    const view = result._unsafeUnwrap();
    expect(view.warehouse).toEqual({
      id: 'warehouse-1',
      name: 'Bodega Medellín',
      municipalityName: 'Medellín',
    });
    expect(view.destination.municipalityName).toBe('Bogotá');
    expect(view.destination.departmentName).toBe('Bogotá D.C.');
  });

  it('returns DELIVERY_NOT_FOUND for an unknown id', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(null),
      warehouseRepository: new FakeWarehouseRepository(WAREHOUSE),
      municipalityRepository: new FakeMunicipalityRepository({}),
    });

    const result = await useCase.execute('unknown-id');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('DELIVERY_NOT_FOUND');
  });

  it('logs an error and rejects when the warehouse is missing', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(buildDelivery()),
      warehouseRepository: new FakeWarehouseRepository(null),
      municipalityRepository: new FakeMunicipalityRepository({}),
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(useCase.execute('delivery-1')).rejects.toThrow(/missing warehouse/);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('logs an error and rejects when the warehouse municipality is missing', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(buildDelivery()),
      warehouseRepository: new FakeWarehouseRepository(WAREHOUSE),
      municipalityRepository: new FakeMunicipalityRepository({ '11001': DESTINATION }),
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(useCase.execute('delivery-1')).rejects.toThrow(/missing warehouse municipality/);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('logs an error and rejects when the destination municipality is missing', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(buildDelivery()),
      warehouseRepository: new FakeWarehouseRepository(WAREHOUSE),
      municipalityRepository: new FakeMunicipalityRepository({ '05001': WAREHOUSE_MUNICIPALITY }),
    });
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(useCase.execute('delivery-1')).rejects.toThrow(/missing destination municipality/);
    expect(errorSpy).toHaveBeenCalledTimes(1);

    errorSpy.mockRestore();
  });

  it('keeps a null addressDetail as null in the view', async () => {
    const useCase = buildUseCase({
      deliveryRepository: new FakeDeliveryRepository(buildDelivery({ addressDetail: null })),
      warehouseRepository: new FakeWarehouseRepository(WAREHOUSE),
      municipalityRepository: new FakeMunicipalityRepository({
        '05001': WAREHOUSE_MUNICIPALITY,
        '11001': DESTINATION,
      }),
    });

    const result = await useCase.execute('delivery-1');

    expect(result._unsafeUnwrap().destination.addressDetail).toBeNull();
  });
});
