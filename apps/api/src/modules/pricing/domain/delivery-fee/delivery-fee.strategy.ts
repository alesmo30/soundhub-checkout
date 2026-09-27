import type { Cents } from '@checkout/shared/contracts';

export interface DeliveryFeeContext {
  readonly subtotalInCents: Cents;
  readonly isMetroArea: boolean;
  readonly distanceKm: number; // integer, from findNearestWarehouse
}

export type FeeRule = 'FREE_METRO' | 'METRO_FLAT' | 'NATIONAL_DISTANCE';

export interface DeliveryFee {
  readonly feeInCents: Cents;
  readonly rule: FeeRule;
}

export interface DeliveryFeeStrategy {
  supports(ctx: DeliveryFeeContext): boolean;
  quote(ctx: DeliveryFeeContext): DeliveryFee;
}
