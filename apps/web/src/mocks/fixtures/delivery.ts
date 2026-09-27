import type { DeliveryView } from '@checkout/shared/contracts';
import { DeliveryStatus, FeeRule } from '@checkout/shared/enums';

export const deliveryFixture: DeliveryView = {
  id: '55555555-5555-4555-8555-555555555501',
  transactionId: '44444444-4444-4444-8444-444444444401',
  status: DeliveryStatus.READY_TO_SHIP,
  warehouse: {
    id: '22222222-2222-4222-8222-222222222201',
    name: 'Medellín DC',
    municipalityName: 'Medellín',
  },
  destination: {
    recipientName: 'Ana Pérez',
    addressLine: 'Cra 43A # 1-50',
    addressDetail: 'Apto 301',
    municipalityName: 'Medellín',
    departmentName: 'Antioquia',
  },
  distanceKm: 4,
  feeRule: FeeRule.FREE_METRO,
  createdAt: '2026-09-26T15:04:05Z',
  updatedAt: '2026-09-26T15:05:10Z',
};
