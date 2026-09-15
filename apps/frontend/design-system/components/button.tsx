import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive' | 'outline' | 'default';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-foreground text-background shadow-xs hover:bg-foreground/90 active:scale-[0.98]',
  default: 'border-transparent bg-foreground text-background shadow-xs hover:bg-foreground/90 active:scale-[0.98]',
  secondary: 'border-border/80 bg-card text-foreground shadow-2xs hover:bg-muted/70 hover:text-foreground active:scale-[0.98]',
  outline: 'border-border/80 bg-transparent text-foreground hover:bg-muted/60 active:scale-[0.98]',
  ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground active:scale-[0.98]',
  danger: 'border-transparent bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-[0.98]',
  destructive: 'border-transparent bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 active:scale-[0.98]',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg',
  md: 'h-9 px-3.5 text-xs sm:text-sm rounded-lg',
  lg: 'h-10 px-4 text-sm rounded-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant | undefined;
  readonly size?: ButtonSize | undefined;
  readonly isLoading?: boolean | undefined;
  readonly leftIcon?: ReactNode | undefined;
  readonly rightIcon?: ReactNode | undefined;
  readonly children?: ReactNode | undefined;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
}
