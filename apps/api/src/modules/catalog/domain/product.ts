export interface Product {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly brand: string;
  readonly description: string;
  readonly priceInCents: number;
  readonly imageUrl: string;
  readonly stockAvailable: number;
  readonly stockReserved: number;
  readonly createdAt: Date;
}
