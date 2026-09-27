import { readFileSync } from 'node:fs';

import type { DataSource, EntityManager } from 'typeorm';

import { ProductOrmEntity } from '../../../../modules/catalog/infrastructure/persistence/product.orm-entity';
import { MunicipalityOrmEntity } from '../../../../modules/locations/infrastructure/persistence/municipality.orm-entity';
import { WarehouseOrmEntity } from '../../../../modules/locations/infrastructure/persistence/warehouse.orm-entity';

export interface SeedSummary {
  municipalities: number;
  warehouses: number;
  products: number;
}

interface MunicipalitySeed {
  code: string;
  name: string;
  departmentCode: string;
  departmentName: string;
  latitude: number;
  longitude: number;
  isMetroArea: boolean;
}

interface WarehouseSeed {
  id: string;
  name: string;
  municipalityCode: string;
  address: string;
  latitude: number;
  longitude: number;
}

interface ProductSeed {
  sku: string;
  name: string;
  brand: string;
  description: string;
  priceInCents: number;
  stock: number;
}

const DATA_DIR = 'src/shared/infrastructure/persistence/seeds/data';

function readJson<T>(fileName: string): T {
  return JSON.parse(readFileSync(`${DATA_DIR}/${fileName}`, 'utf8')) as T;
}

function productImageUrl(sku: string): string {
  return `/images/products/${sku}-640.webp`;
}

// `identifiers` echoes back the client-supplied key for every input row
// regardless of whether ON CONFLICT DO NOTHING skipped it; `raw` (backed by
// RETURNING) reflects only the rows Postgres actually inserted.
function insertedCount(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

async function insertMunicipalities(manager: EntityManager): Promise<number> {
  const seeds = readJson<MunicipalitySeed[]>('municipalities.json');

  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(MunicipalityOrmEntity)
    .values(seeds)
    .orIgnore()
    .returning('code')
    .execute();

  return insertedCount(result.raw);
}

async function insertWarehouses(manager: EntityManager): Promise<number> {
  const seeds = readJson<WarehouseSeed[]>('warehouses.json');

  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(WarehouseOrmEntity)
    .values(seeds)
    .orIgnore()
    .returning('id')
    .execute();

  return insertedCount(result.raw);
}

async function insertProducts(manager: EntityManager): Promise<number> {
  const seeds = readJson<ProductSeed[]>('products.json');

  const result = await manager
    .createQueryBuilder()
    .insert()
    .into(ProductOrmEntity)
    .values(
      seeds.map((seed) => ({
        sku: seed.sku,
        name: seed.name,
        brand: seed.brand,
        description: seed.description,
        priceCents: seed.priceInCents,
        imageUrl: productImageUrl(seed.sku),
        stockAvailable: seed.stock,
        stockReserved: 0,
      })),
    )
    .orIgnore()
    .returning('id')
    .execute();

  return insertedCount(result.raw);
}

export async function seedWithManager(manager: EntityManager): Promise<SeedSummary> {
  const municipalities = await insertMunicipalities(manager);
  const warehouses = await insertWarehouses(manager);
  const products = await insertProducts(manager);

  return { municipalities, warehouses, products };
}

export function runSeed(dataSource: DataSource): Promise<SeedSummary> {
  return dataSource.transaction((manager) => seedWithManager(manager));
}
