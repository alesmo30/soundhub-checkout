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
    description:
      'Audífonos over-ear con cancelación activa de ruido líder en su categoría y hasta 30 horas de batería. Ideales para viajes largos, oficina o estudio, con sonido Hi-Res y llamadas nítidas gracias a sus múltiples micrófonos.',
  },
  {
    id: '11111111-1111-4111-8111-111111111102',
    sku: 'HP-SNY-WF1000XM5',
    name: 'WF-1000XM5',
    brand: 'Sony',
    priceInCents: 129_990_000,
    stockAvailable: 12,
    description:
      'Audífonos in-ear inalámbricos con cancelación activa de ruido y hasta 8 horas de batería, o 24 con el estuche de carga. Perfectos para el día a día en la ciudad, con ajuste cómodo y sonido equilibrado.',
  },
  {
    id: '11111111-1111-4111-8111-111111111103',
    sku: 'HP-BOS-QCULTRA',
    name: 'QuietComfort Ultra Headphones',
    brand: 'Bose',
    priceInCents: 219_990_000,
    stockAvailable: 3,
    description:
      'Audífonos over-ear premium con cancelación de ruido inmersiva y audio espacial Bose Immersive. Hasta 24 horas de batería, pensados para quienes no negocian calidad de sonido ni silencio total.',
  },
  {
    id: '11111111-1111-4111-8111-111111111104',
    sku: 'HP-BOS-QCEARBUDS2',
    name: 'QuietComfort Earbuds II',
    brand: 'Bose',
    priceInCents: 109_990_000,
    stockAvailable: 0,
    description:
      'Audífonos in-ear con cancelación de ruido personalizable según la forma del oído. Hasta 6 horas de batería, o 24 con el estuche, ideales para gimnasio, transporte público o llamadas frecuentes.',
  },
  {
    id: '11111111-1111-4111-8111-111111111105',
    sku: 'HP-APL-AIRPODSPRO2',
    name: 'AirPods Pro (2.ª generación)',
    brand: 'Apple',
    priceInCents: 124_990_000,
    stockAvailable: 20,
    description:
      'Audífonos in-ear con cancelación activa de ruido y audio adaptativo, con hasta 6 horas de batería y 30 con el estuche MagSafe. Se integran de forma nativa con dispositivos Apple para un cambio automático entre equipos.',
  },
  {
    id: '11111111-1111-4111-8111-111111111106',
    sku: 'HP-APL-AIRPODSMAX',
    name: 'AirPods Max',
    brand: 'Apple',
    priceInCents: 299_990_000,
    stockAvailable: 1,
    description:
      'Audífonos over-ear premium con cancelación activa de ruido, audio espacial y sonido de alta fidelidad. Hasta 20 horas de batería, con carcasa de aluminio y controles físicos precisos.',
  },
  {
    id: '11111111-1111-4111-8111-111111111107',
    sku: 'HP-JBL-TUNE520BT',
    name: 'Tune 520BT',
    brand: 'JBL',
    priceInCents: 22_990_000,
    stockAvailable: 25,
    description:
      'Audífonos on-ear inalámbricos sin cancelación de ruido, pensados para uso casual diario. Hasta 57 horas de batería y sonido JBL Pure Bass, una opción económica para música y llamadas.',
  },
  {
    id: '11111111-1111-4111-8111-111111111108',
    sku: 'HP-JBL-LIVE770NC',
    name: 'Live 770NC',
    brand: 'JBL',
    priceInCents: 69_990_000,
    stockAvailable: 8,
    description:
      'Audífonos over-ear con cancelación de ruido adaptativa y hasta 50 horas de batería. Buen equilibrio entre precio y prestaciones para quienes viajan o trabajan en ambientes ruidosos.',
  },
  {
    id: '11111111-1111-4111-8111-111111111109',
    sku: 'HP-SNH-MOMENTUM4',
    name: 'Momentum 4 Wireless',
    brand: 'Sennheiser',
    priceInCents: 159_990_000,
    stockAvailable: 2,
    description:
      'Audífonos over-ear con cancelación de ruido adaptativa y una autonomía sobresaliente de hasta 60 horas. Pensados para quienes buscan sonido audiófilo sin preocuparse por cargar seguido.',
  },
  {
    id: '11111111-1111-4111-8111-111111111110',
    sku: 'HP-BTS-STUDIOPRO',
    name: 'Studio Pro',
    brand: 'Beats',
    priceInCents: 139_990_000,
    stockAvailable: 8,
    description:
      'Audífonos over-ear con cancelación activa de ruido y hasta 24 horas de batería. Compatibles por igual con iOS y Android, con un sonido afinado para géneros urbanos y uso diario.',
  },
  {
    id: '11111111-1111-4111-8111-111111111111',
    sku: 'HP-SMS-BUDS3PRO',
    name: 'Galaxy Buds3 Pro',
    brand: 'Samsung',
    priceInCents: 99_990_000,
    stockAvailable: 12,
    description:
      'Audífonos in-ear con cancelación activa de ruido inteligente y hasta 6 horas de batería, o 26 con el estuche. Se integran especialmente bien con el ecosistema Galaxy, aunque funcionan con cualquier dispositivo Bluetooth.',
  },
  {
    id: '11111111-1111-4111-8111-111111111112',
    sku: 'HP-ATH-M50X',
    name: 'ATH-M50x',
    brand: 'Audio-Technica',
    priceInCents: 74_990_000,
    // The seed stocks 5; 10 keeps a fixture where stock equals the purchase cap.
    stockAvailable: 10,
    description:
      'Audífonos over-ear cerrados de referencia para monitoreo de estudio, cableados y sin cancelación de ruido. Ofrecen un sonido preciso y aislamiento pasivo, ideales para producción musical o mezcla.',
  },
];

export const products: ProductDetail[] = SEEDS.map((seed) => ({
  id: seed.id,
  sku: seed.sku,
  name: seed.name,
  brand: seed.brand,
  priceInCents: seed.priceInCents,
  currency: CURRENCY,
  imageUrl: `/images/products/${seed.sku}-640.webp`,
  stockAvailable: seed.stockAvailable,
  description: seed.description,
  vatIncludedInCents: vatIncludedInCents(seed.priceInCents),
  maxPurchaseQuantity: maxPurchaseQuantity(seed.stockAvailable),
}));
