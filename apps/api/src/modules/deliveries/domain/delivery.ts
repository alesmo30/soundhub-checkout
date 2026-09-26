import type { DeliveryStatus, FeeRule } from '@checkout/shared/enums';

export interface Delivery {
  readonly id: string;
  readonly transactionId: string;
  readonly warehouseId: string;
  readonly municipalityCode: string;
  readonly status: DeliveryStatus;
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine: string;
  readonly addressDetail: string | null;
  readonly distanceKm: number;
  readonly feeRule: FeeRule;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}
