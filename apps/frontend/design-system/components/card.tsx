import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('border-b border-border px-4 py-3 sm:px-5', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement> & { readonly children: ReactNode }) {
  return <h3 className={cn('text-base font-semibold text-foreground leading-none tracking-tight', className)} {...props}>{children}</h3>;
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement> & { readonly children: ReactNode }) {
  return <p className={cn('text-xs text-muted-foreground mt-1', className)} {...props}>{children}</p>;
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('p-4 sm:p-5', className)} {...props}>{children}</div>;
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('flex items-center border-t border-border px-4 py-3 sm:px-5', className)} {...props}>{children}</div>;
}
