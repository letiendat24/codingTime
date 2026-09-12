import { cn } from '../../lib/utils';
import { statusToneMap } from '../tokens';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
};

export function Badge({ children, tone = 'neutral', className }: Readonly<{ children: React.ReactNode; tone?: Tone; className?: string }>) {
  return <span className={cn('inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium', toneClasses[tone], className)}>{children}</span>;
}

export function StatusBadge({ value }: Readonly<{ value: string | null | undefined }>) {
  const normalized = value ?? 'UNKNOWN';
  const tone = statusToneMap[normalized as keyof typeof statusToneMap] ?? 'neutral';
  return <Badge tone={tone}>{normalized.replaceAll('_', ' ')}</Badge>;
}
