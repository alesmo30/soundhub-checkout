import { MinusIcon, PlusIcon } from 'lucide-react';

import { MAX_QUANTITY } from '@checkout/shared/constants';

import { Button } from '@/components/ui/button';

const MIN_QUANTITY = 1;

interface QuantitySelectorProps {
  value: number;
  stockAvailable: number;
  maxPurchaseQuantity: number;
  onChange: (quantity: number) => void;
}

export function QuantitySelector({
  value,
  stockAvailable,
  maxPurchaseQuantity,
  onChange,
}: QuantitySelectorProps) {
  const isOutOfStock = stockAvailable <= 0;
  const canDecrease = !isOutOfStock && value > MIN_QUANTITY;
  const canIncrease = !isOutOfStock && value < maxPurchaseQuantity;
  // Below the cap the stock itself is the limit, which the stock badge already shows.
  const isCapped = !isOutOfStock && maxPurchaseQuantity === MAX_QUANTITY;

  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Cantidad" className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Disminuir cantidad"
          disabled={!canDecrease}
          onClick={() => onChange(value - 1)}
        >
          <MinusIcon aria-hidden="true" />
        </Button>
        <span
          aria-live="polite"
          aria-atomic="true"
          className="min-w-8 text-center text-lg font-semibold text-ink tabular-nums"
        >
          {value}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Aumentar cantidad"
          disabled={!canIncrease}
          onClick={() => onChange(value + 1)}
        >
          <PlusIcon aria-hidden="true" />
        </Button>
      </div>
      {isCapped && <p className="text-sm text-text">Máximo {MAX_QUANTITY} por compra</p>}
    </div>
  );
}
