import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';

import { makeStore, type AppStore, type RootState } from '@/app/store';

export interface RenderWithProvidersOptions {
  preloadedState?: Partial<RootState>;
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  { preloadedState, route = '/' }: RenderWithProvidersOptions = {},
): RenderResult & { store: AppStore; user: UserEvent } {
  const store = makeStore(preloadedState);

  const result = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  );

  return { ...result, store, user: userEvent.setup() };
}
