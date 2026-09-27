import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { QuantitySelector } from './quantity-selector';

interface RenderOptions {
  value: number;
  stockAvailable: number;
  maxPurchaseQuantity: number;
}

function renderSelector(options: RenderOptions) {
  const onChange = jest.fn();
  render(<QuantitySelector {...options} onChange={onChange} />);

  return {
    onChange,
    user: userEvent.setup(),
    decrease: screen.getByRole('button', { name: 'Disminuir cantidad' }),
    increase: screen.getByRole('button', { name: 'Aumentar cantidad' }),
  };
}

describe('QuantitySelector', () => {
  it('announces the value politely', () => {
    renderSelector({ value: 3, stockAvailable: 25, maxPurchaseQuantity: 10 });

    expect(screen.getByText('3')).toHaveAttribute('aria-live', 'polite');
  });

  it('steps the value up and down through onChange', async () => {
    const { onChange, user, decrease, increase } = renderSelector({
      value: 3,
      stockAvailable: 25,
      maxPurchaseQuantity: 10,
    });

    await user.click(increase);
    await user.click(decrease);

    expect(onChange).toHaveBeenNthCalledWith(1, 4);
    expect(onChange).toHaveBeenNthCalledWith(2, 2);
  });

  it('cannot go below 1', async () => {
    const { onChange, user, decrease, increase } = renderSelector({
      value: 1,
      stockAvailable: 25,
      maxPurchaseQuantity: 10,
    });

    expect(decrease).toBeDisabled();
    expect(increase).toBeEnabled();
    await user.click(decrease);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('caps at 10 when stock is 25 and says so', async () => {
    const { onChange, user, increase } = renderSelector({
      value: 10,
      stockAvailable: 25,
      maxPurchaseQuantity: 10,
    });

    expect(increase).toBeDisabled();
    await user.click(increase);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Máximo 10 por compra')).toBeInTheDocument();
  });

  it('stops at the stock below the cap, without the cap helper', () => {
    const { increase } = renderSelector({ value: 3, stockAvailable: 3, maxPurchaseQuantity: 3 });

    expect(increase).toBeDisabled();
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
  });

  it('is disabled entirely at stock 0', () => {
    const { decrease, increase } = renderSelector({
      value: 1,
      stockAvailable: 0,
      maxPurchaseQuantity: 0,
    });

    expect(decrease).toBeDisabled();
    expect(increase).toBeDisabled();
    expect(screen.queryByText(/Máximo/)).not.toBeInTheDocument();
  });
});
