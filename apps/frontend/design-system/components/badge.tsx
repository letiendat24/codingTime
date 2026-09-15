import { cn } from '../../lib/utils';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'blue' | 'mint' | 'sand' | 'lavender' | 'rose' | 'yellow' | 'cyan';
export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border/60 bg-muted/70 text-muted-foreground',
  success: 'border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning: 'border-amber-600/20 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  danger: 'border-rose-600/20 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  info: 'border-sky-600/20 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  blue: 'border-blue-200/60 bg-pastel-blue text-blue-900 dark:text-blue-200 dark:border-blue-900/40',
  mint: 'border-emerald-200/60 bg-pastel-mint text-emerald-900 dark:text-emerald-200 dark:border-emerald-900/40',
  sand: 'border-amber-200/60 bg-pastel-sand text-amber-900 dark:text-amber-200 dark:border-amber-900/40',
  lavender: 'border-purple-200/60 bg-pastel-lavender text-purple-900 dark:text-purple-200 dark:border-purple-900/40',
  rose: 'border-rose-200/60 bg-pastel-rose text-rose-900 dark:text-rose-200 dark:border-rose-900/40',
  yellow: 'border-yellow-200/60 bg-pastel-yellow text-yellow-900 dark:text-yellow-200 dark:border-yellow-900/40',
  cyan: 'border-cyan-200/60 bg-pastel-cyan text-cyan-900 dark:text-cyan-200 dark:border-cyan-900/40',
};

const variantClasses: Record<BadgeVariant, string> = {
  default: 'border-border/60 bg-muted/80 text-foreground',
  secondary: 'border-transparent bg-muted/60 text-muted-foreground',
  outline: 'border-border/80 bg-transparent text-foreground',
  destructive: 'border-rose-600/20 bg-rose-500/10 text-rose-700 dark:text-rose-400',
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
    <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-tight leading-normal', styling, className)}>
      {children}
    </span>
  );
}
