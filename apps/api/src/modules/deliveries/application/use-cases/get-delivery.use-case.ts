import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DeliveryView } from '@checkout/shared/contracts';

import type {
  Municipality,
  MunicipalityRepository,
  Warehouse,
  WarehouseRepository,
} from '../../../locations';
import { MUNICIPALITY_REPOSITORY, WAREHOUSE_REPOSITORY } from '../../../locations';
import type { DomainError } from '../../../../shared/domain/domain-error';
import { errAsync, okAsync, ResultAsync } from '../../../../shared/domain/result';
import type { Delivery } from '../../domain/delivery';
import { deliveryNotFound } from '../../domain/delivery.errors';
import type { DeliveryRepository } from '../ports/delivery.repository.port';
import { DELIVERY_REPOSITORY } from '../ports/delivery.repository.port';
import { toDeliveryView } from './helpers/to-delivery-view';

@Injectable()
export class GetDeliveryUseCase {
  private readonly logger = new Logger(GetDeliveryUseCase.name);

  constructor(
    @Inject(DELIVERY_REPOSITORY) private readonly deliveryRepository: DeliveryRepository,
    @Inject(WAREHOUSE_REPOSITORY) private readonly warehouseRepository: WarehouseRepository,
    @Inject(MUNICIPALITY_REPOSITORY)
    private readonly municipalityRepository: MunicipalityRepository,
  ) {}

  execute(id: string): ResultAsync<DeliveryView, DomainError> {
    return this.load(id).andThen((delivery) => this.present(delivery));
  }

  private load(id: string): ResultAsync<Delivery, DomainError> {
    return this.deliveryRepository.findById(id).andThen((delivery) => {
      if (!delivery) {
        return errAsync<Delivery, DomainError>(deliveryNotFound(id));
      }

      return okAsync<Delivery, DomainError>(delivery);
    });
  }

  private present(delivery: Delivery): ResultAsync<DeliveryView, DomainError> {
    return this.warehouseRepository.findById(delivery.warehouseId).andThen((warehouse) => {
      if (!warehouse) {
        return this.rejectMissing<DeliveryView>(delivery.id, 'warehouse');
      }

      return ResultAsync.combine([
        this.municipalityRepository.findByCode(warehouse.municipalityCode),
        this.municipalityRepository.findByCode(delivery.municipalityCode),
      ]).andThen(([warehouseMunicipality, destination]) =>
        this.presentFromCollaborators({ delivery, warehouse, warehouseMunicipality, destination }),
      );
    });
  }

  private presentFromCollaborators(input: {
    delivery: Delivery;
    warehouse: Warehouse;
    warehouseMunicipality: Municipality | null;
    destination: Municipality | null;
  }): ResultAsync<DeliveryView, DomainError> {
    const { delivery, warehouse, warehouseMunicipality, destination } = input;

    if (!warehouseMunicipality) {
      return this.rejectMissing<DeliveryView>(delivery.id, 'warehouse municipality');
    }

    if (!destination) {
      return this.rejectMissing<DeliveryView>(delivery.id, 'destination municipality');
    }

    return okAsync<DeliveryView, DomainError>(
      toDeliveryView({ delivery, warehouse, warehouseMunicipality, destination }),
    );
  }

  // A missing warehouse or municipality is a data inconsistency: nothing in
  // this codebase soft-deletes them today, and this spec explicitly leaves
  // findByIdIncludingDeleted out of scope (references/layering.md — same
  // "throw on an unreachable state" pattern as
  // GetTransactionStatusUseCase.present).
  private rejectMissing<T>(deliveryId: string, missing: string): ResultAsync<T, DomainError> {
    this.logger.error(`delivery ${deliveryId} references a missing ${missing}`);
    throw new Error(`GetDeliveryUseCase: missing ${missing} for delivery ${deliveryId}`);
  }
}
