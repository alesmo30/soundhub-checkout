import type { PropsWithChildren } from 'react';

import { Header } from './header';
import { PageContainer } from './page-container';
import { TestModeBanner } from './test-mode-banner';
import { TrustFooter } from './trust-footer';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <TestModeBanner />
      <Header />
      <main className="flex-1">
        <PageContainer>{children}</PageContainer>
      </main>
      <TrustFooter />
    </div>
  );
}
