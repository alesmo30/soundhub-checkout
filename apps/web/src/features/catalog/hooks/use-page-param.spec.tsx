import { renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { MemoryRouter } from 'react-router';

import { toPage, usePageParam } from './use-page-param';

function readPageAt(route: string) {
  const wrapper = ({ children }: PropsWithChildren) => (
    <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
  );

  return renderHook(() => usePageParam(), { wrapper }).result.current;
}

describe('usePageParam', () => {
  it.each([
    ['/', 1],
    ['/?page=1', 1],
    ['/?page=2', 2],
    ['/?page=12', 12],
  ])('reads %s as page %i', (route, page) => {
    expect(readPageAt(route)).toBe(page);
  });

  it.each(['abc', '0', '-1', '1.5', '', '02', '2abc'])('treats ?page=%s as page 1', (value) => {
    expect(readPageAt(`/?page=${value}`)).toBe(1);
  });
});

describe('toPage', () => {
  it('drops the param for page 1', () => {
    expect(toPage(1)).toEqual({ search: '' });
  });

  it('writes ?page=N for any other page', () => {
    expect(toPage(3)).toEqual({ search: '?page=3' });
  });
});
