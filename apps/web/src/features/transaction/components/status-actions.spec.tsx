import { screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';

import { catalogApi } from '@/features/catalog/catalog.api';
import {
  selectCard,
  selectCheckoutProductId,
  selectCheckoutStep,
  selectIsCheckoutOpen,
  selectQuantityFor,
  selectSessionContact,
} from '@/features/checkout';
import { saveContact } from '@/features/checkout/checkout-session.slice';
import { rememberDetails, selectRememberedDetails } from '@/features/customer';
import { server } from '@/mocks/server';
import { products } from '@/mocks/fixtures/products';
import {
  transactionApprovedFixture,
  transactionDeclinedFixture,
} from '@/mocks/fixtures/transaction';
import { renderWithProviders } from '@/test/render-with-providers';

import { StatusActions } from './status-actions';

const CONTACT = {
  customer: {
    documentNumber: '1000000000',
    fullName: 'Ana Rios',
    email: 'ana@example.com',
    phone: '3000000000',
  },
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Cra 43A # 1-50',
  },
};

const REMEMBERED = {
  customer: CONTACT.customer,
  address: {
    departmentCode: '05',
    municipalityCode: '05001',
    addressLine: 'Cra 43A # 1-50',
  },
};

const PRODUCT_ID = transactionApprovedFixture.product.id;

describe('StatusActions', () => {
  it('shows only "Volver al producto" for an approved status', () => {
    renderWithProviders(<StatusActions view={transactionApprovedFixture} />);

    expect(screen.getByRole('button', { name: 'Volver al producto' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Intentar con otra tarjeta' }),
    ).not.toBeInTheDocument();
  });

  it('shows both actions for a failed status', () => {
    renderWithProviders(<StatusActions view={transactionDeclinedFixture} />);

    expect(screen.getByRole('button', { name: 'Intentar con otra tarjeta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver al producto' })).toBeInTheDocument();
  });

  it('"Volver al producto" refetches the product, closes the dialog and keeps the remembered contact', async () => {
    const product = products.find((candidate) => candidate.id === PRODUCT_ID);
    if (!product) {
      throw new Error('Fixture inconsistency: PRODUCT_ID missing from products fixture');
    }

    let productRequests = 0;
    server.use(
      http.get('*/api/v1/products/:id', () => {
        productRequests += 1;
        return HttpResponse.json({ data: product });
      }),
    );

    const { store, user } = renderWithProviders(
      <StatusActions view={transactionApprovedFixture} />,
    );
    store.dispatch(saveContact(CONTACT));
    store.dispatch(rememberDetails(REMEMBERED));

    const subscription = store.dispatch(catalogApi.endpoints.getProduct.initiate(PRODUCT_ID));
    await subscription;
    expect(productRequests).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Volver al producto' }));

    await waitFor(() => expect(productRequests).toBe(2));

    expect(selectIsCheckoutOpen(store.getState())).toBe(false);
    expect(selectCheckoutProductId(store.getState())).toBeNull();
    // clearCheckoutSession wipes the in-progress session contact, but never
    // the opted-in remembered customer data (a separate, persisted slice).
    expect(selectSessionContact(store.getState())).toBeNull();
    expect(selectRememberedDetails(store.getState())).toEqual(REMEMBERED);

    subscription.unsubscribe();
  });

  it('"Intentar con otra tarjeta" reopens the checkout on CARD, with the contact kept', async () => {
    const { store, user } = renderWithProviders(
      <StatusActions view={transactionDeclinedFixture} />,
    );
    store.dispatch(saveContact(CONTACT));

    await user.click(screen.getByRole('button', { name: 'Intentar con otra tarjeta' }));

    expect(selectIsCheckoutOpen(store.getState())).toBe(true);
    expect(selectCheckoutProductId(store.getState())).toBe(PRODUCT_ID);
    expect(selectCheckoutStep(store.getState())).toBe('CARD');
    expect(selectSessionContact(store.getState())).toEqual(CONTACT);
    expect(selectCard(store.getState())).toBeNull();
    expect(selectQuantityFor(store.getState(), PRODUCT_ID)).toBe(
      transactionDeclinedFixture.quantity,
    );
  });
});
