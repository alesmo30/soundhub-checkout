import { useEffect, useState } from 'react';

// Matches DESIGN.md's `md` breakpoint: the summary is a bottom sheet below
// it and a dialog from it on (see specs/11-web-payment.md#scope,
// "summary-sheet.tsx"). jsdom stubs `matchMedia` to always report `false`
// (see src/test/setup.ts), so a component spec that needs the desktop
// branch overrides it itself before rendering.
const DESKTOP_QUERY = '(min-width: 768px)';

function readIsDesktop(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DESKTOP_QUERY).matches
    : false;
}

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(readIsDesktop);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQueryList = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    // The lazy `useState` initializer above already read `.matches` for
    // this same render; only a genuine change needs to reach React here.
    mediaQueryList.addEventListener('change', handleChange);

    return () => mediaQueryList.removeEventListener('change', handleChange);
  }, []);

  return isDesktop;
}
