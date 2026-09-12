import type { SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  readonly label: string;
  readonly value: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly hasError?: boolean;
  readonly options?: readonly SelectOption[];
}

export function Select({ className, hasError, options, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
        className,
      )}
      {...props}
    >
      {options
        ? options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))
        : children}
    </select>
  );
}
