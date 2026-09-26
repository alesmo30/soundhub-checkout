import * as React from 'react';

import { cn } from '@/lib/cn';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-input border border-input bg-surface px-3 text-base text-ink outline-none transition-colors placeholder:text-text disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40',
        'aria-invalid:border-danger',
        className,
      )}
      {...props}
    />
  );
}

export { Input };
