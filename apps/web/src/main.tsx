import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from './app/providers';
import { env } from './config/env';
import './styles/index.css';

async function enableMocking() {
  if (!env.apiMocking) {
    return;
  }

  const { worker } = await import('./mocks/browser');

  await worker.start();
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

await enableMocking();

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
);
