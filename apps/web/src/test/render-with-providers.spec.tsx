import { useLocation } from 'react-router';

import { renderWithProviders } from './render-with-providers';

function LocationProbe() {
  const location = useLocation();

  return <div>pathname: {location.pathname}</div>;
}

describe('renderWithProviders', () => {
  it('renders ui inside a memory router at the given route', () => {
    const { getByText } = renderWithProviders(<LocationProbe />, {
      route: '/products/abc',
    });

    expect(getByText('pathname: /products/abc')).toBeInTheDocument();
  });

  it('defaults the route to "/"', () => {
    const { getByText } = renderWithProviders(<LocationProbe />);

    expect(getByText('pathname: /')).toBeInTheDocument();
  });

  it('exposes a working store seeded with preloadedState', () => {
    const checkout = {
      productId: null,
      quantity: 1,
      isDialogOpen: false,
      step: 'CONTACT' as const,
    };
    const customer = { remembered: null };
    const { store } = renderWithProviders(<LocationProbe />, {
      preloadedState: { checkout, customer },
    });

    expect(store.getState().checkout).toEqual(checkout);
    expect(store.getState().customer).toEqual(customer);
  });

  it('exposes a user-event instance', () => {
    const { user } = renderWithProviders(<LocationProbe />);

    expect(user).toBeDefined();
    expect(typeof user.click).toBe('function');
  });
});
