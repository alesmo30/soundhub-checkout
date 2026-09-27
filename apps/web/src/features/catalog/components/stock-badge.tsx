import { Badge } from '@/components/ui/badge';

interface StockBadgeProps {
  stockAvailable: number;
}

export function StockBadge({ stockAvailable }: StockBadgeProps) {
  if (stockAvailable <= 0) {
    return <Badge variant="danger">Agotado</Badge>;
  }

  if (stockAvailable === 1) {
    return <Badge variant="neutral">Última unidad</Badge>;
  }

  return <Badge variant="success">{stockAvailable} disponibles</Badge>;
}
