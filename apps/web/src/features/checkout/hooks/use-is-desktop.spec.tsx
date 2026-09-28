import { act, renderHook } from '@testing-library/react';

import { useIsDesktop } from './use-is-desktop';

type Listener = (event: MediaQueryListEvent) => void;

function mockMatchMedia(initialMatches: boolean) {
  const listeners: Listener[] = [];
  const mediaQueryList = {
    matches: initialMatches,
    media: '(min-width: 768px)',
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener(this: void, _event: string, listener: Listener) {
      listeners.push(listener);
    },
    removeEventListener(this: void, _event: string, listener: Listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    dispatchEvent: () => false,
  };

  window.matchMedia = jest.fn().mockReturnValue(mediaQueryList);

  return {
    fireChange(this: void, matches: boolean) {
      mediaQueryList.matches = matches;
      listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent));
    },
  };
}

describe('useIsDesktop', () => {
  const originalMatchMedia = window.matchMedia.bind(window);

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it('reads the initial match against (min-width: 768px)', () => {
    mockMatchMedia(true);

    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    const { fireChange } = mockMatchMedia(false);

    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(false);

    act(() => fireChange(true));

    expect(result.current).toBe(true);
  });

  it('falls back to false when matchMedia is unavailable', () => {
    // @ts-expect-error simulating an environment without matchMedia
    window.matchMedia = undefined;

    const { result } = renderHook(() => useIsDesktop());

    expect(result.current).toBe(false);
  });
});
