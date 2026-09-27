import type { PropsWithChildren } from 'react';

export function PageContainer({ children }: PropsWithChildren) {
  return <div className="mx-auto max-w-content px-4 md:px-8">{children}</div>;
}
