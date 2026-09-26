import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';

import {
  CatalogPlaceholderPage,
  NotFoundPage,
  ProductPlaceholderPage,
  TransactionPlaceholderPage,
} from './placeholder-pages';

export const routes: RouteObject[] = [
  {
    element: <Outlet />,
    children: [
      { path: '/', element: <CatalogPlaceholderPage /> },
      { path: '/products/:id', element: <ProductPlaceholderPage /> },
      { path: '/transactions/:id', element: <TransactionPlaceholderPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
