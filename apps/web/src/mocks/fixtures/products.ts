import type { ProductDetail } from '@checkout/shared/contracts';
import { CURRENCY } from '@checkout/shared/constants';

const VAT_RATE = 0.19;
const MAX_PURCHASE_QUANTITY_CAP = 10;

function vatIncludedInCents(priceInCents: number): number {
  return Math.round(priceInCents * VAT_RATE);
}

function maxPurchaseQuantity(stockAvailable: number): number {
  return Math.min(stockAvailable, MAX_PURCHASE_QUANTITY_CAP);
}

interface ProductSeed {
  id: string;
  sku: string;
  name: string;
  brand: string;
  priceInCents: number;
  stockAvailable: number;
  description: string;
}

const SEEDS: ProductSeed[] = [
  {
    id: '11111111-1111-4111-8111-111111111101',
    sku: 'HP-SNY-WH1000XM5',
    name: 'WH-1000XM5',
    brand: 'Sony',
    priceInCents: 189_990_000,
    stockAvailable: 7,
    description: 'Audífonos inalámbricos con cancelación de ruido líder en su categoría.',
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    sku: 'HP-BOS-QC45',
    name: 'QuietComfort 45',
    brand: 'Bose',
    priceInCents: 169_900_000,
    stockAvailable: 5,
    description: 'Comodidad todo el día con cancelación de ruido balanceada.',
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    sku: 'HP-JBL-TUNE760NC',
    name: 'Tune 760NC',
    brand: 'JBL',
    priceInCents: 39_900_000,
    stockAvailable: 20,
    description: 'Sonido JBL Pure Bass con cancelación activa de ruido, precio accesible.',
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    sku: 'HP-SEN-MOMENTUM4',
    name: 'Momentum 4',
    brand: 'Sennheiser',
    priceInCents: 179_900_000,
    stockAvailable: 3,
    description: 'Hasta 60 horas de batería con sonido audiófilo Sennheiser.',
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    sku: 'HP-APL-AIRPODSMAX',
    name: 'AirPods Max',
    brand: 'Apple',
    priceInCents: 249_900_000,
    stockAvailable: 4,
    description: 'Audio espacial y cancelación de ruido adaptativa de Apple.',
  },
  {
    id: '11111111-1111-4111-8111-111111111106',
    sku: 'HP-BEA-STUDIO3',
    name: 'Studio3 Wireless',
    brand: 'Beats',
    priceInCents: 129_900_000,
    stockAvailable: 0,
    description: 'Tecnología de cancelación de ruido pura adaptativa.',
  },
  {
    id: '11111111-1111-4111-8111-111111111107',
    sku: 'HP-SKU-CRUSHEREVO',
    name: 'Crusher Evo',
    brand: 'Skullcandy',
    priceInCents: 89_900_000,
    stockAvailable: 15,
    description: 'Bajos sensoriales ajustables para una experiencia inmersiva.',
  },
  {
    id: '11111111-1111-4111-8111-111111111108',
    sku: 'HP-ATH-M50X',
    name: 'ATH-M50x',
    brand: 'Audio-Technica',
    priceInCents: 99_900_000,
    stockAvailable: 10,
    description: 'El estándar de estudio para monitoreo profesional.',
  },
  {
    id: '11111111-1111-4111-8111-111111111109',
    sku: 'HP-ANK-LIFEQ30',
    name: 'Life Q30',
    brand: 'Anker Soundcore',
    priceInCents: 49_900_000,
    stockAvailable: 30,
    description: 'Cancelación de ruido híbrida a un precio imbatible.',
  },
  {
    id: '11111111-1111-4111-8111-111111111110',
    sku: 'HP-JAB-ELITE45H',
    name: 'Elite 45h',
    brand: 'Jabra',
    priceInCents: 59_900_000,
    stockAvailable: 12,
    description: 'Hasta 50 horas de batería, ideal para el día a día.',
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'HP-SAM-LEVELON',
    name: 'Level On',
    brand: 'Samsung',
    priceInCents: 79_900_000,
    stockAvailable: 8,
    description: 'Sonido UHQ con controles táctiles intuitivos.',
  },
  {
    id: '11111111-1111-4111-8111-111111111112',
    sku: 'HP-MAR-MAJORIV',
    name: 'Major IV',
    brand: 'Marshall',
    priceInCents: 109_900_000,
    stockAvailable: 6,
    description: 'Diseño icónico Marshall con carga inalámbrica integrada.',
  },
];

export const products: ProductDetail[] = SEEDS.map((seed) => ({
  id: seed.id,
  sku: seed.sku,
  name: seed.name,
  brand: seed.brand,
  priceInCents: seed.priceInCents,
  currency: CURRENCY,
  imageUrl: `/images/products/${seed.sku.toLowerCase()}-640.webp`,
  stockAvailable: seed.stockAvailable,
  description: seed.description,
  vatIncludedInCents: vatIncludedInCents(seed.priceInCents),
  maxPurchaseQuantity: maxPurchaseQuantity(seed.stockAvailable),
}));
