import { useAppDispatch, useAppSelector } from '@/app/hooks';
import { Button } from '@/components/ui/button';

import { selectCard } from '../checkout-session.slice';
import { goToStep } from '../checkout.slice';

// Stub: title, masked card and "Editar" back to 2b. web 04 owns and
// replaces the rest of this screen's content (see specs/07-web-checkout.md
// #scope, Part 2).
export function SummarySheet() {
  const dispatch = useAppDispatch();
  const card = useAppSelector(selectCard);

  function handleEditar() {
    dispatch(goToStep('CARD'));
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-heading text-xl font-bold text-text-strong">¡Listo!</h2>
      {card && (
        <p className="font-mono text-base text-text">
          {card.brand} •••• {card.last4}
        </p>
      )}
      <Button type="button" variant="secondary" onClick={handleEditar} className="self-start">
        Editar
      </Button>
    </div>
  );
}
