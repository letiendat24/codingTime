import type { InputHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly hasError?: boolean;
}

export function Input({ className, hasError, type = 'text', ...props }: InputProps) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20',
        className,
      )}
      type={type}
      {...props}
    />
  );
}
