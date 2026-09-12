import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm shadow-slate-950/5', className)} {...props}>{children}</div>;
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('border-b px-4 py-3 sm:px-5', className)} {...props}>{children}</div>;
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('p-4 sm:p-5', className)} {...props}>{children}</div>;
}
