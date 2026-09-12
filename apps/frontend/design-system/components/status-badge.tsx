import { Badge, type Tone } from './badge';
import { statusToneMap } from '../tokens';

export function StatusBadge({
  value,
  tone,
  children,
  className,
}: Readonly<{
  value?: string | null | undefined;
  tone?: Tone | undefined;
  children?: React.ReactNode | undefined;
  className?: string | undefined;
}>) {
  const resolvedValue = (typeof children === 'string' ? children : value) ?? 'UNKNOWN';
  const resolvedTone = tone ?? statusToneMap[resolvedValue as keyof typeof statusToneMap] ?? 'neutral';
  return (
    <Badge tone={resolvedTone} className={className}>
      {children ?? resolvedValue.replaceAll('_', ' ')}
    </Badge>
  );
}
