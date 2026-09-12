import { cn } from '../../lib/utils';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
};

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-primary/20 bg-primary/10 text-primary',
  secondary: 'border-border bg-muted text-muted-foreground',
  outline: 'border-border bg-transparent text-foreground',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
};

export function Badge({
  children,
  tone,
  variant,
  className,
}: Readonly<{
  children?: React.ReactNode | undefined;
  tone?: Tone | undefined;
  variant?: BadgeVariant | undefined;
  className?: string | undefined;
}>) {
  const styling = variant
    ? variantClasses[variant]
    : tone
      ? toneClasses[tone]
      : toneClasses.neutral;

  return (
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', styling, className)}>
      {children}
    </span>
  );
}
