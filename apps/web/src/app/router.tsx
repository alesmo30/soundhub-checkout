import { lazy, Suspense } from 'react';
import { Outlet, createBrowserRouter, type RouteObject } from 'react-router';

import { AppShell } from '@/components/layout/app-shell';
import { env } from '@/config/env';
import { CatalogPage, ProductPage } from '@/features/catalog';

import { NotFoundPage, TransactionPlaceholderPage } from './placeholder-pages';

const DesignShowcasePage = lazy(() => import('./design-showcase-page'));

export const routes: RouteObject[] = [
  {
    element: (
      <AppShell>
        <Outlet />
      </AppShell>
    ),
    children: [
      { path: '/', element: <CatalogPage /> },
      { path: '/products/:id', element: <ProductPage /> },
      { path: '/transactions/:id', element: <TransactionPlaceholderPage /> },
      ...(env.isDev
        ? [
            {
              path: '/__design',
              element: (
                <Suspense fallback={null}>
                  <DesignShowcasePage />
                </Suspense>
              ),
            },
          ]
        : []),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
