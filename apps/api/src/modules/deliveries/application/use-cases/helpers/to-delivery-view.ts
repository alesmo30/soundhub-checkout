import type { DeliveryView } from '@checkout/shared/contracts';

import type { Municipality, Warehouse } from '../../../../locations';
import type { Delivery } from '../../../domain/delivery';

export interface ToDeliveryViewInput {
  readonly delivery: Delivery;
  readonly warehouse: Warehouse;
  readonly warehouseMunicipality: Municipality;
  readonly destination: Municipality;
}

// Mechanical mapping (references/coding-conventions.md#c3): warehouse.* is
// the pickup/origin side (the warehouse and its own municipality), while
// destination is where the delivery ships to — never mix the two.
export function toDeliveryView(input: ToDeliveryViewInput): DeliveryView {
  const { delivery, warehouse, warehouseMunicipality, destination } = input;

  return {
    id: delivery.id,
    transactionId: delivery.transactionId,
    status: delivery.status,
    warehouse: {
      id: warehouse.id,
      name: warehouse.name,
      municipalityName: warehouseMunicipality.name,
    },
    destination: {
      recipientName: delivery.recipientName,
      addressLine: delivery.addressLine,
      addressDetail: delivery.addressDetail,
      municipalityName: destination.name,
      departmentName: destination.departmentName,
    },
    distanceKm: delivery.distanceKm,
    feeRule: delivery.feeRule,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
