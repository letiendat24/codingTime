import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return (
    <div className={cn('rounded-xl border border-border/70 bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all', className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('border-b border-border/60 px-5 py-4', className)} {...props}>{children}</div>;
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement> & { readonly children: ReactNode }) {
  return <h3 className={cn('text-base font-semibold text-foreground leading-tight tracking-normal', className)} {...props}>{children}</h3>;
}

export function CardDescription({ className, children, ...props }: HTMLAttributes<HTMLParagraphElement> & { readonly children: ReactNode }) {
  return <p className={cn('text-xs text-muted-foreground mt-1 leading-relaxed', className)} {...props}>{children}</p>;
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('p-5', className)} {...props}>{children}</div>;
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { readonly children: ReactNode }) {
  return <div className={cn('flex items-center border-t border-border/60 px-5 py-3.5', className)} {...props}>{children}</div>;
}

