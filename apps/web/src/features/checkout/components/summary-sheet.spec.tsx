import { screen } from '@testing-library/react';
import { CardBrand } from '@checkout/shared/enums';

import { renderWithProviders } from '@/test/render-with-providers';

import { SummarySheet } from './summary-sheet';

describe('SummarySheet', () => {
  it('shows the masked card from the session', () => {
    renderWithProviders(<SummarySheet />, {
      preloadedState: {
        checkoutSession: {
          contact: null,
          quoteMunicipalityCode: null,
          card: { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' },
          installments: 1,
          acceptance: null,
        },
      },
    });

    expect(screen.getByText('VISA •••• 4242')).toBeInTheDocument();
  });

  it('dispatches goToStep(\'CARD\') from "Editar"', async () => {
    const { store, user } = renderWithProviders(<SummarySheet />, {
      preloadedState: {
        checkout: { productId: null, quantity: 1, isDialogOpen: false, step: 'SUMMARY' },
        checkoutSession: {
          contact: null,
          quoteMunicipalityCode: null,
          card: { token: 'tok_test_4242', brand: CardBrand.VISA, last4: '4242' },
          installments: 1,
          acceptance: null,
        },
      },
    });

    await user.click(screen.getByRole('button', { name: 'Editar' }));

    expect(store.getState().checkout.step).toBe('CARD');
  });

  it('renders no masked card when the session has none', () => {
    renderWithProviders(<SummarySheet />);

    expect(screen.queryByText(/••••/)).not.toBeInTheDocument();
  });
});
