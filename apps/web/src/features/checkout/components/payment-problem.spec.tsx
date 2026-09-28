import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { formatCop } from '@/lib/money';

import type { PaymentProblem as PaymentProblemState } from '../checkout-session.slice';
import { PaymentProblem } from './payment-problem';

function renderProblem(problem: PaymentProblemState, currentTotalInCents = 400_000_00) {
  const onAdjustQuantity = jest.fn();
  const onRetry = jest.fn();

  render(
    <PaymentProblem
      problem={problem}
      currentTotalInCents={currentTotalInCents}
      onAdjustQuantity={onAdjustQuantity}
      onRetry={onRetry}
    />,
  );

  return { onAdjustQuantity, onRetry };
}

describe('PaymentProblem', () => {
  it('PRICE_CHANGED shows the old and the new total, highlighted', () => {
    renderProblem({ kind: 'PRICE_CHANGED', previousTotalInCents: 350_000_00 }, 400_000_00);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain(formatCop(350_000_00));
    expect(alert.textContent).toContain(formatCop(400_000_00));
  });

  it('OUT_OF_STOCK shows its message and "Ajustar cantidad" closes the dialog', async () => {
    const user = userEvent.setup();
    const { onAdjustQuantity } = renderProblem({ kind: 'OUT_OF_STOCK' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ya no hay unidades suficientes para tu pedido. No se hizo ningún cobro.',
    );

    await user.click(screen.getByRole('button', { name: 'Ajustar cantidad' }));

    expect(onAdjustQuantity).toHaveBeenCalledTimes(1);
  });

  it('UNAVAILABLE (503) shows its message with no action button', () => {
    renderProblem({ kind: 'UNAVAILABLE' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Los pagos no están disponibles en este momento. Inténtalo de nuevo en unos segundos.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('RATE_LIMITED (429) shows its message with no action button', () => {
    renderProblem({ kind: 'RATE_LIMITED' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Hiciste demasiados intentos. Espera un momento e inténtalo de nuevo.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('UNCERTAIN shows only "Reintentar", wired to onRetry', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderProblem({ kind: 'UNCERTAIN' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos confirmar tu pago. No pagues de nuevo: toca Reintentar para verificarlo.',
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('FAILED (400/422/other) shows the generic failure message with no action button', () => {
    renderProblem({ kind: 'FAILED' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No pudimos procesar tu pago. No se hizo ningún cobro.',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
