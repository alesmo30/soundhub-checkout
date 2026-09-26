import type { FeeRule, DeliveryStatus } from '../enums';

export interface DeliveryView {
  id: string;
  transactionId: string;
  status: DeliveryStatus;
  warehouse: { id: string; name: string; municipalityName: string };
  destination: {
    recipientName: string;
    addressLine: string;
    addressDetail: string | null;
    municipalityName: string;
    departmentName: string;
  };
  distanceKm: number;
  feeRule: FeeRule;
  createdAt: string;
  updatedAt: string;
}
